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
  const elementToShow = $(idToShow);
  if (elementToShow) {
    elementToShow.classList.add("show");
    // Trigger reflow to restart animation
    elementToShow.style.animation = 'none';
    setTimeout(() => {
      elementToShow.style.animation = '';
    }, 10);
  }
};

// Function to show feedback messages with animation
const showFeedback = (elementId, message, type = '') => {
  const element = $(elementId);
  if (element) {
    element.textContent = message;
    element.className = `status-message ${type} show`;
  }
};

// Function to hide feedback messages with animation
const hideFeedback = (elementId) => {
  const element = $(elementId);
  if (element) {
    element.classList.remove('show');
    setTimeout(() => {
      element.textContent = '';
    }, 300);
  }
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
    showFeedback("login-message", "⚠ Please fill in both fields.", "error");
    return;
  }

  try {
    const userRef = doc(db, "users", username);
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      showFeedback("login-message", "⚠ Username already taken.", "error");
      return;
    }
    await setDoc(userRef, { username, password });
    showFeedback("login-message", "✅ Registered! You can now login.", "success");
  } catch (err) {
    console.error(err);
    showFeedback("login-message", "❌ Error registering.", "error");
  }
};

window.userLogin = async function () {
  const username = $("login-username").value.trim();
  const password = $("login-password").value.trim();
  const msg = $("login-message");

  if (!username || !password) {
    showFeedback("login-message", "⚠ Please fill in both fields.", "error");
    return;
  }

  try {
    const docRef = doc(db, "users", username);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists() || docSnap.data().password !== password) {
      showFeedback("login-message", "❌ Invalid login.", "error");
    } else {
      currentUser = username;
      hideFeedback("login-message");
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
    showFeedback("login-message", "❌ Error logging in.", "error");
  }
};

window.adminLogin = function () {
  const username = $("admin-username").value.trim();
  const password = $("admin-password").value.trim();
  const msg = $("admin-message");

  if (username === "admin" && password === "1234") {
    hideFeedback("admin-message");
    showOnly("admin-panel");
  } else {
    showFeedback("admin-message", "❌ Wrong admin credentials.", "error");
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
    showFeedback("feedback-message", "⚠ Please enter your feedback.", "error");
    return;
  }
  try {
    await addDoc(collection(db, "feedback"), {
      message: text,
      user: currentUser || "Guest",
      date: Timestamp.now()
    });
    showFeedback("feedback-message", "✅ Feedback submitted!", "success");
    $("feedback-text").value = "";
  } catch (error) {
    console.error(error);
    showFeedback("feedback-message", "❌ Error sending feedback.", "error");
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
    showFeedback("add-feedback", "⚠ Please fill all fields.", "error");
    return;
  }

  try {
    await addDoc(collection(db, "questions"), {
      user: currentUser,
      question: qText,
      options: choices,
      answer: correct
    });
    showFeedback("add-feedback", "✅ Question added!", "success");
    $("new-question").value = "";
    document.querySelectorAll(".choice-input").forEach(c => c.value = "");
    $("correct-answer").value = "";
  } catch (err) {
    console.error(err);
    showFeedback("add-feedback", "❌ Error adding question.", "error");
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
    showFeedback("global-add-feedback", "⚠ Please fill all fields.", "error");
    return;
  }

  try {
    await addDoc(collection(db, "global_questions"), {
      question,
      options: choices,
      answer: correct
    });
    showFeedback("global-add-feedback", "✅ Global question added!", "success");
    $("global-question-text").value = "";
    $("global-correct-answer").value = "";
    document.querySelectorAll(".global-choice-input").forEach(c => c.value = "");
    await loadGlobalQuestions();
  } catch (err) {
    console.error(err);
    showFeedback("global-add-feedback", "❌ Error adding global question.", "error");
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
  if (errorMsg) {
    errorMsg.textContent = "";
    errorMsg.className = "status-message";
  }

  try {
    // Show loading message
    if (errorMsg) {
      errorMsg.className = "status-message";
      errorMsg.innerHTML = '<span class="loading"></span> Loading questions...';
    }

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
        showFeedback("quiz-error-message", "❌ You don't have any questions yet. Please add some first.", "error");
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
      showFeedback("quiz-error-message", "❌ Error loading questions.", "error");
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
  optionsContainer.style.opacity = "0";

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

  // Add fade-in effect to options
  setTimeout(() => {
    optionsContainer.style.opacity = "1";
    optionsContainer.style.transition = "opacity 0.3s ease";
  }, 50);

  startTimer();
}

function startTimer() {
  timeLeft = 10;
  const timerElement = $("timer");
  timerElement.innerText = `⌛Time: ${timeLeft}`;
  timerElement.classList.remove("warning");
  $("next-btn").style.display = "none";

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    timerElement.innerText = `⌛Time: ${timeLeft}`;
    
    // Add warning animation when time is low
    if (timeLeft <= 3) {
      timerElement.classList.add("warning");
    }
    
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      const q = quizQuestions[currentQuestionIndex];
      const correctIndex = q.shuffled.findIndex(o => o.isCorrect);
      disableOptions();
      $("feedback").innerText = `⏰ Time's up! Correct: ${q.shuffled[correctIndex].text}`;
      
      // Add animation class to feedback
      const feedback = $("feedback");
      feedback.classList.remove("show");
      setTimeout(() => {
        feedback.classList.add("show");
      }, 10);
      
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
  
  // Add animation class to feedback
  const feedback = $("feedback");
  feedback.classList.remove("show");
  setTimeout(() => {
    feedback.classList.add("show");
  }, 10);
  
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
  // Add fade out effect to current question
  const quizContainer = document.getElementById("quiz");
  if (quizContainer) {
    quizContainer.style.opacity = "0";
    quizContainer.style.transform = "translateY(-10px)";
    setTimeout(() => {
      currentQuestionIndex++;
      if (currentQuestionIndex >= quizQuestions.length) {
        endQuiz();
      } else {
        $("feedback").innerText = "";
        loadQuestion();
        // Reset opacity for next question
        quizContainer.style.opacity = "1";
        quizContainer.style.transform = "translateY(0)";
      }
    }, 300);
  } else {
    currentQuestionIndex++;
    if (currentQuestionIndex >= quizQuestions.length) {
      endQuiz();
    } else {
      $("feedback").innerText = "";
      loadQuestion();
    }
  }
};

function endQuiz() {
  showOnly("score-screen");
  $("score-text").innerText = `Your Score: ${score} / ${quizQuestions.length}`;
  $("score-message").innerText = score >= 1 ? "🎉 Okay Na!" : "💀 Pag study balik hoi!";
  
  // Add celebration effect for perfect score
  if (score === quizQuestions.length && quizQuestions.length > 0) {
    const scoreScreen = document.getElementById("score-screen");
    scoreScreen.style.animation = "celebration 1s ease";
  }
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
  showFeedback("gen-status", "Analyzing image…");

  const input = $("quiz-image");
  if (!input.files || !input.files[0]) {
    showFeedback("gen-status", "Please choose an image first.", "error");
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
      if (resp.status === 404) {
        showFeedback("gen-status", "❌ API route not found (404). Ensure api/generate-questions.js exists and is deployed.", "error");
      } else if (resp.status === 429) {
        showFeedback("gen-status", "❌ Rate limited (429). Please wait a moment and try again.", "error");
      } else if (resp.status === 500) {
        showFeedback("gen-status", `❌ Server error: ${errorText}`, "error");
      } else {
        showFeedback("gen-status", `❌ Error ${resp.status}: ${errorText}`, "error");
      }
      return;
    }

    const data = await resp.json();
    if (!data.questions || !Array.isArray(data.questions) || data.questions.length === 0) {
      showFeedback("gen-status", "No questions generated.", "error");
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

    showFeedback("gen-status", `✅ Added ${data.questions.length} generated question(s)! Check "View Questionnaires" or start the quiz.`, "success");
  } catch (e) {
    console.error(e);
    showFeedback("gen-status", `Generation failed: ${e.message}`, "error");
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
  
  // Create particles
  createParticles();
});

// Function to create animated particles
function createParticles() {
  const particlesContainer = document.querySelector('.particles');
  if (!particlesContainer) return;
  
  // Create 30 particles
  for (let i = 0; i < 30; i++) {
    const particle = document.createElement('div');
    particle.classList.add('particle');
    
    // Random size between 2px and 6px
    const size = Math.random() * 4 + 2;
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    
    // Random position
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.top = `${Math.random() * 100}%`;
    
    // Random animation duration between 10s and 30s
    const duration = Math.random() * 20 + 10;
    particle.style.animationDuration = `${duration}s`;
    
    // Random animation delay
    const delay = Math.random() * 5;
    particle.style.animationDelay = `${delay}s`;
    
    particlesContainer.appendChild(particle);
  }
}

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