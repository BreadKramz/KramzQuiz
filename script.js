import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, setDoc, getDoc, doc, query, where, orderBy, deleteDoc, Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD0YczZXnEp1Yup8aKpn-tzuaxUMOiDxVE",
  authDomain: "kramzquiz.firebaseapp.com",
  projectId: "kramzquiz",
  storageBucket: "kramzquiz.firebasestorage.app",
  messagingSenderId: "1085936591670",
  appId: "1:1085936591670:web:7070a37f9d6d76ce9d0997",
  measurementId: "G-CNGQ06ZFT0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ================== State ==================
let currentUser = null;
let currentQuestionIndex = 0;
let score = 0;
let timerInterval;
let timeLeft = 10;
let quizQuestions = [];
let questionToDeleteId = null;
let globalQuestionToDeleteId = null;

// =============== Helpers ===================
const $ = (id) => document.getElementById(id);
const showOnly = (idToShow) => {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  $(idToShow)?.classList.add("show");
};
const safeOn = (id, evt, fn) => {
  const el = $(id);
  if (el) el.addEventListener(evt, fn);
};

// ================= Init ====================
// - Persist dark theme & music
// - Safe event binding
// - Close confirm overlays via ESC/outside click
document.addEventListener("DOMContentLoaded", () => {
  // Theme (default: light OFF => dark ON only if saved as dark)
  const savedTheme = localStorage.getItem("theme"); // 'dark' | 'light'
  document.body.classList.toggle("dark", savedTheme === "dark");

  // Music restore
  const music = $("background-music");
  const musicPref = localStorage.getItem("music"); // 'on' | 'off'
  if (music) {
    if (musicPref === "on") {
      music.volume = 1;
      music.play().catch(() => {});
    } else {
      music.pause();
    }
  }

  // Settings toggles (bind safely)
  safeOn("music-toggle", "change", function () {
    const m = $("background-music");
    if (!m) return;
    if (this.checked) {
      localStorage.setItem("music", "on");
      m.play().catch(() => {});
    } else {
      localStorage.setItem("music", "off");
      m.pause();
    }
  });

  safeOn("theme-toggle-settings", "change", function () {
    document.body.classList.toggle("dark", this.checked);
    localStorage.setItem("theme", this.checked ? "dark" : "light");
  });

  // ESC to close confirm overlays
  window.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const personal = $("confirm-delete-box");
    const global = $("confirmDeleteOverlay");
    if (personal && personal.style.display === "flex") {
      personal.style.display = "none"; questionToDeleteId = null;
    }
    if (global && global.style.display === "flex") {
      global.style.display = "none"; globalQuestionToDeleteId = null;
    }
  });

  // Click outside overlay to close
  const personal = $("confirm-delete-box");
  if (personal) {
    personal.addEventListener("click", (e) => {
      if (e.target === personal) { personal.style.display = "none"; questionToDeleteId = null; }
    });
  }
  const global = $("confirmDeleteOverlay");
  if (global) {
    global.addEventListener("click", (e) => {
      if (e.target === global) { global.style.display = "none"; globalQuestionToDeleteId = null; }
    });
  }

  // ARIA helpers
  addAriaAttributes();
});

// ================= Auth ====================
window.userRegister = async function () {
  const username = $("login-username").value.trim();
  const password = $("login-password").value.trim();
  const msg = $("login-message");

  if (!username || !password) {
    msg.className = "status-message error";
    msg.innerText = "⚠ Please fill in both fields.";
    return;
  }

  try {
    const userRef = doc(db, "users", username);
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      msg.className = "status-message error";
      msg.innerText = "⚠ Username already taken.";
      return;
    }
    await setDoc(userRef, { username, password });
    msg.className = "status-message success";
    msg.innerText = "✅ Registered! You can now login.";
  } catch (err) {
    console.error(err);
    msg.className = "status-message error";
    msg.innerText = "❌ Error registering.";
  }
};

window.userLogin = async function () {
  const username = $("login-username").value.trim();
  const password = $("login-password").value.trim();
  const msg = $("login-message");

  if (!username || !password) {
    msg.className = "status-message error";
    msg.innerText = "⚠ Please fill in both fields.";
    return;
  }

  try {
    const docRef = doc(db, "users", username);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists() || docSnap.data().password !== password) {
      msg.className = "status-message error";
      msg.innerText = "❌ Invalid login.";
    } else {
      currentUser = username;
      msg.innerText = "";
      showOnly("start-screen");

      // Play music only if user wants it
      const music = $("background-music");
      if (music && localStorage.getItem("music") === "on") {
        music.volume = 1;
        music.play().catch(() => {});
      }
    }
  } catch (err) {
    console.error(err);
    msg.className = "status-message error";
    msg.innerText = "❌ Error logging in.";
  }
};

window.adminLogin = function () {
  const username = $("admin-username").value.trim();
  const password = $("admin-password").value.trim();
  const msg = $("admin-message");

  if (username === "admin" && password === "1234") {
    showOnly("admin-panel");
  } else {
    msg.className = "status-message error";
    msg.innerText = "❌ Wrong admin credentials.";
  }
};

// =============== Navigation ===============
window.showAdminLogin   = () => showOnly("admin-login");
window.backToLogin      = () => showOnly("login-screen");
window.backToStart      = () => showOnly("start-screen");
window.backToAdminPanel = () => showOnly("admin-panel");
window.returnToStart    = () => { showOnly("start-screen"); $("feedback").innerText = ""; };

// =============== Feedback =================
window.openFeedbackPanel = () => showOnly("feedback-panel");

window.submitFeedback = async function () {
  const text = $("feedback-text").value.trim();
  const msg  = $("feedback-message");

  if (!text) {
    msg.className = "status-message error";
    msg.innerText = "⚠ Please enter your feedback.";
    return;
  }
  try {
    await addDoc(collection(db, "feedback"), {
      message: text,
      user: currentUser || "Guest",
      date: Timestamp.now()
    });
    msg.className = "status-message success";
    msg.innerText = "✅ Feedback submitted!";
    $("feedback-text").value = "";
  } catch (error) {
    console.error(error);
    msg.className = "status-message error";
    msg.innerText = "❌ Error sending feedback.";
  }
};

window.viewFeedbacks = async function () {
  const list = $("feedback-list");
  list.innerHTML = "<p>Loading...</p>";
  showOnly("feedback-view-panel");

  try {
    const qSnap = await getDocs(query(collection(db, "feedback"), orderBy("date", "asc")));
    if (qSnap.empty) {
      list.innerHTML = "<p>No feedback yet.</p>";
      return;
    }
    let feedbacks = [];
    let num = 1;
    qSnap.forEach(docSnap => {
      const fb = docSnap.data();
      feedbacks.push({ num: num++, ...fb });
    });
    list.innerHTML = "";
    feedbacks.reverse().forEach(fb => {
      const date = fb.date?.toDate ? fb.date.toDate() : new Date();
      const formattedDate = date.toLocaleString();
      const div = document.createElement("div");
      div.innerHTML = `<strong>Feedback ${fb.num}</strong> (${fb.user || "Guest"})<br>
                       ${fb.message}<br>
                       <small>${formattedDate}</small>`;
      div.style.marginBottom = "10px";
      list.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    list.innerHTML = "<p>❌ Error loading feedback.</p>";
  }
};

// ========= Personal Questions =========
window.toggleAddQuestion = () => showOnly("add-question-screen");

window.addCustomQuestion = async function () {
  const qText   = $("new-question").value.trim();
  const choices = Array.from(document.querySelectorAll(".choice-input")).map(c => c.value.trim());
  const correct = parseInt($("correct-answer").value) - 1;
  const msg     = $("add-feedback");

  if (!qText || choices.some(c => !c) || isNaN(correct) || correct < 0 || correct >= choices.length) {
    msg.className = "status-message error";
    msg.innerText = "⚠ Please fill all fields.";
    return;
  }

  try {
    await addDoc(collection(db, "questions"), {
      user: currentUser,
      question: qText,
      options: choices,
      answer: correct
    });
    msg.className = "status-message success";
    msg.innerText = "✅ Question added!";
    $("new-question").value = "";
    document.querySelectorAll(".choice-input").forEach(c => c.value = "");
    $("correct-answer").value = "";
  } catch (err) {
    console.error(err);
    msg.className = "status-message error";
    msg.innerText = "❌ Error adding question.";
  }
};

window.toggleViewPanel = async function () {
  showOnly("view-panel");
  const container = $("questions-list-container");
  container.innerHTML = "<p>Loading...</p>";

  try {
    const qSnap = await getDocs(query(collection(db, "questions"), where("user", "==", currentUser)));
    if (qSnap.empty) {
      container.innerHTML = "<p>No saved questions.</p>";
      return;
    }
    container.innerHTML = "";
    qSnap.forEach(docSnap => {
      const q = docSnap.data();
      const div = document.createElement("div");
      div.innerHTML = `
        <strong>${q.question}</strong><br>
        Choices: ${q.options.join(", ")}<br>
        Answer: ${q.options[q.answer]}<br>
        <button class="debug-btn" onclick="deleteQuestion('${docSnap.id}')">🗑 Delete</button>
        <hr style="margin:10px 0;">
      `;
      container.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>❌ Error loading questions.</p>";
  }
};

window.deleteQuestion = function (id) {
  questionToDeleteId = id;
  const overlay = $("confirm-delete-box");
  if (overlay) overlay.style.display = "flex"; // flex -> centered panel
};

window.confirmDelete = async function () {
  if (!questionToDeleteId) return;
  try {
    await deleteDoc(doc(db, "questions", questionToDeleteId));
    questionToDeleteId = null;
    const overlay = $("confirm-delete-box");
    if (overlay) overlay.style.display = "none";
    toggleViewPanel(); // refresh list
  } catch (err) {
    console.error(err);
  }
};

window.cancelDelete = function () {
  questionToDeleteId = null;
  const overlay = $("confirm-delete-box");
  if (overlay) overlay.style.display = "none";
};

// ========= Global Questions (Admin) =========
window.toggleGlobalQuestionPanel = async function () {
  showOnly("global-question-panel");
  await loadGlobalQuestions();
};

window.addGlobalQuestion = async function () {
  const question = $("global-question-text").value.trim();
  const choices  = Array.from(document.querySelectorAll(".global-choice-input")).map(c => c.value.trim());
  const correct  = parseInt($("global-correct-answer").value) - 1;
  const msg      = $("global-add-feedback");

  if (!question || choices.some(c => !c) || isNaN(correct) || correct < 0 || correct >= choices.length) {
    msg.className = "status-message error";
    msg.innerText = "⚠ Please fill all fields.";
    return;
  }

  try {
    await addDoc(collection(db, "global_questions"), {
      question,
      options: choices,
      answer: correct
    });
    msg.className = "status-message success";
    msg.innerText = "✅ Global question added!";
    $("global-question-text").value = "";
    $("global-correct-answer").value = "";
    document.querySelectorAll(".global-choice-input").forEach(c => c.value = "");
    await loadGlobalQuestions();
  } catch (err) {
    console.error(err);
    msg.className = "status-message error";
    msg.innerText = "❌ Error adding global question.";
  }
};

async function loadGlobalQuestions() {
  const container = $("global-questions-list");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  try {
    const qSnap = await getDocs(collection(db, "global_questions"));
    if (qSnap.empty) {
      container.innerHTML = "<p>No global questions yet.</p>";
      return;
    }
    container.innerHTML = "";
    qSnap.forEach(docSnap => {
      const q = docSnap.data();
      const div = document.createElement("div");
      div.innerHTML = `<strong>${q.question}</strong><br>
        Choices: ${q.options.join(", ")}<br>
        Answer: ${q.options[q.answer]}<br>
        <button class="debug-btn" onclick="deleteGlobalQuestion('${docSnap.id}')">🗑 Delete</button>
        <hr style="margin:10px 0;">`;
      container.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>❌ Error loading global questions.</p>";
  }
}

window.viewGlobalQuestions = async function () {
  showOnly("global-view-panel");
  const container = $("global-view-list");
  container.innerHTML = "<p>Loading...</p>";

  try {
    const qSnap = await getDocs(collection(db, "global_questions"));
    if (qSnap.empty) {
      container.innerHTML = "<p>No global questions available.</p>";
      return;
    }
    container.innerHTML = "";
    qSnap.forEach(docSnap => {
      const q = docSnap.data();
      const div = document.createElement("div");
      div.innerHTML = `<strong>${q.question}</strong><br>
        Choices: ${q.options.join(", ")}<br>
        Answer: ${q.options[q.answer]}<br>
        <button class="debug-btn" onclick="prepareGlobalDelete('${docSnap.id}')">🗑 Delete</button>
        <hr style="margin:10px 0;">`;
      container.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>❌ Error loading global questions.</p>";
  }
};

window.deleteGlobalQuestion = async function (id) {
  // Immediate delete (used in Global Question Panel list)
  try {
    await deleteDoc(doc(db, "global_questions", id));
    await loadGlobalQuestions();
  } catch (err) {
    console.error(err);
  }
};

window.prepareGlobalDelete = function (id) {
  // Show confirm overlay (used in Global View Panel)
  globalQuestionToDeleteId = id;
  const overlay = $("confirmDeleteOverlay");
  if (overlay) overlay.style.display = "flex";
};

window.confirmGlobalDelete = async function () {
  if (!globalQuestionToDeleteId) return;
  try {
    await deleteDoc(doc(db, "global_questions", globalQuestionToDeleteId));
    globalQuestionToDeleteId = null;
    const overlay = $("confirmDeleteOverlay");
    if (overlay) overlay.style.display = "none";
    await viewGlobalQuestions();
  } catch (err) {
    console.error("Failed to delete global question:", err);
  }
};

window.cancelGlobalDelete = function () {
  globalQuestionToDeleteId = null;
  const overlay = $("confirmDeleteOverlay");
  if (overlay) overlay.style.display = "none";
};

// =============== Settings ==================
// (Dark mode button lives here; removed the top button)
window.toggleSettings = function () {
  showOnly("settings-screen");
  const themeToggle = $("theme-toggle-settings");
  const musicToggle = $("music-toggle");
  if (themeToggle) themeToggle.checked = document.body.classList.contains("dark");
  if (musicToggle) musicToggle.checked = localStorage.getItem("music") === "on";
};

// =============== Quiz Flow =================
window.startQuiz = async function () {
  const errorMsg = $("quiz-error-message");
  if (errorMsg) errorMsg.innerText = "";

  try {
    const qSnap      = await getDocs(query(collection(db, "questions"), where("user", "==", currentUser)));
    const globalSnap = await getDocs(collection(db, "global_questions"));

    let allQuestions = [];
    qSnap.forEach(docSnap => {
      const q = docSnap.data();
      if (q.question && Array.isArray(q.options) && typeof q.answer === "number" && q.options[q.answer] !== undefined) {
        allQuestions.push(q);
      }
    });
    globalSnap.forEach(docSnap => {
      const q = docSnap.data();
      if (q.question && Array.isArray(q.options) && typeof q.answer === "number" && q.options[q.answer] !== undefined) {
        allQuestions.push(q);
      }
    });

    if (allQuestions.length === 0) {
      if (errorMsg) {
        errorMsg.className = "status-message error";
        errorMsg.innerText = "❌ You don't have any questions yet. Please add some first.";
      }
      return;
    }

    allQuestions.sort(() => Math.random() - 0.5);
    quizQuestions = allQuestions;
    currentQuestionIndex = 0;
    score = 0;

    showOnly("quiz");
    loadQuestion();
  } catch (err) {
    console.error(err);
    if (errorMsg) {
      errorMsg.className = "status-message error";
      errorMsg.innerText = "❌ Error loading questions.";
    }
  }
};

function loadQuestion() {
  const original = quizQuestions[currentQuestionIndex];
  if (!original) { endQuiz(); return; }

  $("question-counter").innerText = `Question ${currentQuestionIndex + 1} of ${quizQuestions.length}`;
  $("question").innerText = original.question;
  $("feedback").innerText = "";
  $("next-btn").style.display = "none";

  const optionsContainer = $("options-container");
  optionsContainer.innerHTML = "";

  const correctText = original.options[original.answer];
  const shuffled = original.options
    .map(opt => ({ text: opt, isCorrect: opt === correctText }))
    .sort(() => Math.random() - 0.5);

  quizQuestions[currentQuestionIndex].shuffled = shuffled;

  shuffled.forEach((opt, i) => {
    const btn = document.createElement("button");
    btn.className = "option";
    btn.innerText = opt.text;
    btn.onclick = () => {
      selectAnswer(i);
      disableOptions();
      clearInterval(timerInterval);
    };
    optionsContainer.appendChild(btn);
  });

  startTimer();
}

function startTimer() {
  timeLeft = 10;
  $("timer").innerText = `⌛Time: ${timeLeft}`;
  $("next-btn").style.display = "none";

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    $("timer").innerText = `⌛Time: ${timeLeft}`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      const q = quizQuestions[currentQuestionIndex];
      const correctIndex = q.shuffled.findIndex(o => o.isCorrect);
      disableOptions();
      $("feedback").innerText = `⏰ Time's up! Correct: ${q.shuffled[correctIndex].text}`;
      $("next-btn").style.display = "inline-block";
    }
  }, 1000);
}

function selectAnswer(index) {
  const q = quizQuestions[currentQuestionIndex];
  const selected = q.shuffled[index];

  if (selected.isCorrect) {
    score++;
    $("feedback").innerText = "✅ Correct!";
  } else {
    const correctIndex = q.shuffled.findIndex(o => o.isCorrect);
    $("feedback").innerText = `❌ Wrong! Correct: ${q.shuffled[correctIndex].text}`;
  }
  $("next-btn").style.display = "inline-block";
}

function disableOptions() {
  const opts = document.querySelectorAll(".option");
  const q = quizQuestions[currentQuestionIndex];
  opts.forEach((btn, i) => {
    btn.disabled = true;
    if (q.shuffled[i].isCorrect) {
      btn.classList.add("correct");
    } else {
      btn.classList.add("incorrect");
    }
  });
}

window.nextQuestion = function () {
  currentQuestionIndex++;
  if (currentQuestionIndex >= quizQuestions.length) {
    endQuiz();
  } else {
    $("feedback").innerText = "";
    loadQuestion();
  }
};

function endQuiz() {
  showOnly("score-screen");
  $("score-text").innerText = `Your Score: ${score} / ${quizQuestions.length}`;
  $("score-message").innerText = score >= 1 ? "🎉 Okay Na!" : "💀 Pag study balik hoi!";
}

// =============== Logout ====================
window.logoutUser = function () {
  currentUser = null;

  // if user disabled music, stop playback
  const musicToggle = $("music-toggle");
  const music = $("background-music");
  if (music && musicToggle && !musicToggle.checked) {
    music.pause();
    music.currentTime = 0;
  }

  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  $("login-screen").classList.add("show");

  $("login-username").value = "";
  $("login-password").value = "";
  $("login-message").textContent = "";
  $("quiz-error-message").textContent = "";
};

// ======= AI: Image → Questions =======
async function fileToDataURL(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

async function fetchWithRetry(url, options, retries = 2, delayMs = 1500) {
  for (let i = 0; i <= retries; i++) {
    const resp = await fetch(url, options);
    if (resp.ok) return resp;
    if (resp.status === 429 && i < retries) {
      await new Promise(r => setTimeout(r, delayMs));
      continue;
    }
    return resp;
  }
}

window.generateQuestionsFromImage = async function () {
  const status = $("gen-status");
  status.className = "status-message";
  status.innerText = "Analyzing image…";

  const input = $("quiz-image");
  if (!input.files || !input.files[0]) {
    status.className = "status-message error";
    status.innerText = "Please choose an image first.";
    return;
  }

  const btn = Array.from(document.querySelectorAll("button"))
    .find(b => b.textContent && b.textContent.toLowerCase().includes("generate from image"));
  if (btn) btn.disabled = true;

  try {
    const dataUrl = await fileToDataURL(input.files[0]);

    const resp = await fetchWithRetry("/api/generate-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: dataUrl,
        count: 4,
        difficulty: "easy"
      })
    });

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error(`API Error (${resp.status})`, errorText);
      status.className = "status-message error";
      if (resp.status === 404) {
        status.innerText = "❌ API route not found (404). Ensure api/generate-questions.js exists and is deployed.";
      } else if (resp.status === 429) {
        status.innerText = "❌ Rate limited (429). Please wait a moment and try again.";
      } else if (resp.status === 500) {
        status.innerText = `❌ Server error: ${errorText}`;
      } else {
        status.innerText = `❌ Error ${resp.status}: ${errorText}`;
      }
      return;
    }

    const data = await resp.json();
    if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
      status.className = "status-message error";
      status.innerText = "No questions generated.";
      return;
    }

    for (const q of data.questions) {
      if (!q.question || !Array.isArray(q.options) || typeof q.correctIndex !== "number") continue;
      if (!q.options[q.correctIndex]) continue;

      await addDoc(collection(db, "questions"), {
        user: currentUser,
        question: q.question,
        options: q.options,
        answer: q.correctIndex
      });
    }

    status.className = "status-message success";
    status.innerText = `✅ Added ${data.questions.length} generated question(s)! Check "View Questionnaires" or start the quiz.`;
  } catch (e) {
    console.error(e);
    status.className = "status-message error";
    status.innerText = `Generation failed: ${e.message}`;
  } finally {
    if (btn) btn.disabled = false;
  }
};

// ======= Accessibility helpers =======
function addAriaAttributes() {
  document.querySelectorAll('button').forEach(button => {
    if (!button.getAttribute('aria-label') && button.textContent) {
      button.setAttribute('aria-label', button.textContent.trim());
    }
  });
  document.querySelectorAll('.status-message').forEach(msg => {
    msg.setAttribute('aria-live', 'polite');
    msg.setAttribute('role', 'status');
  });
  document.querySelectorAll('.quiz-container, .start-screen, .settings-screen, .add-question-screen, .admin-login, .admin-screen')
    .forEach(section => section.setAttribute('role', 'region'));
}

document.addEventListener("DOMContentLoaded", () => {
  // Force dark mode by default
  document.body.classList.add("dark");

  // If you have a checkbox toggle, set it to checked
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle) {
    themeToggle.checked = true;
  }
});

document.addEventListener("DOMContentLoaded", () => {
  const music = document.getElementById("background-music");
  if (music) {
    music.volume = 1;
    music.play().catch(err => console.warn("Music autoplay blocked:", err));
  }

  const musicToggle = document.getElementById("music-toggle");
  if (musicToggle) {
    musicToggle.checked = true; // show toggle as "on"
  }
});