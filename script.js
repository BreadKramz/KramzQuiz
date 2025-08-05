// ===== Firebase Setup =====
import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";

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

let currentUser = null;
let currentQuestionIndex = 0;
let score = 0;
let timerInterval;
let timeLeft = 10;
let quizQuestions = [];
let questionToDeleteId = null;

// ===== USER REGISTER =====
window.userRegister = async function () {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  const msg = document.getElementById("login-message");

  if (!username || !password) {
    msg.innerText = "⚠ Please fill in both fields.";
    msg.style.color = "red";
    return;
  }

  try {
    const userRef = doc(db, "users", username);
    const existing = await getDoc(userRef);
    if (existing.exists()) {
      msg.innerText = "⚠ Username already taken.";
      msg.style.color = "red";
      return;
    }
    await setDoc(userRef, { username, password });
    msg.style.color = "green";
    msg.innerText = "✅ Registered! You can now login.";
  } catch (err) {
    console.error(err);
    msg.innerText = "❌ Error registering.";
    msg.style.color = "red";
  }
};

// ===== USER LOGIN =====
window.userLogin = async function () {
  const username = document.getElementById("login-username").value.trim();
  const password = document.getElementById("login-password").value.trim();
  const msg = document.getElementById("login-message");

  if (!username || !password) {
    msg.innerText = "⚠ Please fill in both fields.";
    msg.style.color = "red";
    return;
  }

  try {
    const docRef = doc(db, "users", username);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists() || docSnap.data().password !== password) {
      msg.innerText = "❌ Invalid login.";
      msg.style.color = "red";
    } else {
      currentUser = username;
      msg.innerText = "";
      document.getElementById("login-screen").classList.remove("show");
      document.getElementById("start-screen").classList.add("show");

      // 🔊 Play background music
      const music = document.getElementById("background-music");
      if (music) {
        music.volume = 1; // Optional: adjust volume
        music.play().catch(err => console.log("Music play error:", err));
      }
    }
  } catch (err) {
    console.error(err);
    msg.innerText = "❌ Error logging in.";
    msg.style.color = "red";
  }
};


// ===== ADMIN LOGIN =====
window.adminLogin = function () {
  const username = document.getElementById("admin-username").value.trim();
  const password = document.getElementById("admin-password").value.trim();
  const msg = document.getElementById("admin-message");

  if (username === "admin" && password === "1234") {
    document.getElementById("admin-login").classList.remove("show");
    document.getElementById("admin-panel").classList.add("show");
  } else {
    msg.innerText = "❌ Wrong admin credentials.";
    msg.style.color = "red";
  }
};

window.showAdminLogin = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("admin-login").classList.add("show");
};

// ===== BACK BUTTONS =====
window.backToLogin = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("login-screen").classList.add("show");
};

window.backToStart = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("start-screen").classList.add("show");
};

window.backToAdminPanel = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("admin-panel").classList.add("show");
};

window.returnToStart = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("start-screen").classList.add("show");
  document.getElementById("feedback").innerText = ""; // ✅ Clear feedback
};

// ===== FEEDBACK =====
window.openFeedbackPanel = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("feedback-panel").classList.add("show");
};

window.submitFeedback = async function () {
  const text = document.getElementById("feedback-text").value.trim();
  const msg = document.getElementById("feedback-message");

  if (!text) {
    msg.innerText = "⚠ Please enter your feedback.";
    msg.style.color = "red";
    return;
  }

  try {
    await addDoc(collection(db, "feedback"), {
      message: text,
      user: currentUser || "Guest",
      date: Timestamp.now()
    });
    msg.innerText = "✅ Feedback submitted!";
    msg.style.color = "green";
    document.getElementById("feedback-text").value = "";
  } catch (error) {
    console.error(error);
    msg.innerText = "❌ Error sending feedback.";
    msg.style.color = "red";
  }
};

window.viewFeedbacks = async function () {
  const list = document.getElementById("feedback-list");
  list.innerHTML = "<p>Loading...</p>";
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("feedback-view-panel").classList.add("show");

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

// ===== ADD QUESTION =====
window.toggleAddQuestion = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("add-question-screen").classList.add("show");
};

window.addCustomQuestion = async function () {
  const qText = document.getElementById("new-question").value.trim();
  const choices = Array.from(document.querySelectorAll(".choice-input")).map(c => c.value.trim());
  const correct = parseInt(document.getElementById("correct-answer").value) - 1;
  const msg = document.getElementById("add-feedback");

  if (!qText || choices.some(c => !c) || isNaN(correct) || correct < 0 || correct >= choices.length) {
    msg.innerText = "⚠ Please fill all fields.";
    msg.style.color = "red";
    return;
  }

  try {
    await addDoc(collection(db, "questions"), {
      user: currentUser,
      question: qText,
      options: choices,
      answer: correct
    });
    msg.innerText = "✅ Question added!";
    msg.style.color = "green";
    document.getElementById("new-question").value = "";
    document.querySelectorAll(".choice-input").forEach(c => c.value = "");
    document.getElementById("correct-answer").value = "";
  } catch (err) {
    console.error(err);
    msg.innerText = "❌ Error adding question.";
    msg.style.color = "red";
  }
};

// ===== VIEW QUESTIONS =====
window.toggleViewPanel = async function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("view-panel").classList.add("show");
  const container = document.getElementById("questions-list-container");
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
      div.innerHTML = `<strong>${q.question}</strong><br>Choices: ${q.options.join(", ")}<br>
        Answer: ${q.options[q.answer]}<br>
        <button class="debug-btn" onclick="deleteQuestion('${docSnap.id}')">🗑 Delete</button>`;
      container.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = "<p>❌ Error loading questions.</p>";
  }
};

window.deleteQuestion = function (id) {
  questionToDeleteId = id;
  document.getElementById("confirm-delete-box").style.display = "block";
};

window.confirmDelete = async function () {
  if (!questionToDeleteId) return;

  try {
    await deleteDoc(doc(db, "questions", questionToDeleteId));
    document.getElementById("confirm-delete-box").style.display = "none";
    questionToDeleteId = null;
    toggleViewPanel(); // refresh the list
  } catch (err) {
    console.error(err);
  }
};

window.cancelDelete = function () {
  questionToDeleteId = null;
  document.getElementById("confirm-delete-box").style.display = "none";
};

// ===== SETTINGS =====
window.toggleSettings = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("settings-screen").classList.add("show");

  // Set checkbox based on music state
  const music = document.getElementById("background-music");
  document.getElementById("music-toggle").checked = !music.paused;
};

// Music checkbox change listener
document.getElementById("music-toggle").addEventListener("change", function () {
  const music = document.getElementById("background-music");
  if (this.checked) {
    music.play().catch(err => console.warn("Music play error:", err));
  } else {
    music.pause();
  }
});


// ===== QUIZ GAMEPLAY FIXED =====
window.startQuiz = async function () {
  const errorMsg = document.getElementById("quiz-error-message");
  errorMsg.innerText = "";

  try {
    // ✅ Get only current user's questions
    const qSnap = await getDocs(query(collection(db, "questions"), where("user", "==", currentUser)));

    let allQuestions = [];

    qSnap.forEach(docSnap => {
      const q = docSnap.data();
      if (
        q.question &&
        Array.isArray(q.options) &&
        typeof q.answer === "number" &&
        q.options[q.answer] !== undefined
      ) {
        allQuestions.push(q);
      }
    });

    if (allQuestions.length === 0) {
      errorMsg.innerText = "❌ You don't have any questions yet. Please add some first.";
      return;
    }

    allQuestions.sort(() => Math.random() - 0.5);

    quizQuestions = allQuestions;
    currentQuestionIndex = 0;
    score = 0;

    document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
    document.getElementById("quiz").classList.add("show");

    loadQuestion();
  } catch (err) {
    console.error(err);
    errorMsg.innerText = "❌ Error loading questions.";
  }
};


function loadQuestion() {
  const original = quizQuestions[currentQuestionIndex];

  if (!original) {
    endQuiz();
    return;
  }

  // ✅ Update counter
  document.getElementById("question-counter").innerText = `Question ${currentQuestionIndex + 1} of ${quizQuestions.length}`;
  document.getElementById("question").innerText = original.question;
  document.getElementById("feedback").innerText = ""; // 🔄 Clear previous feedback
  document.getElementById("next-btn").style.display = "none"; // Hide next button

  const optionsContainer = document.getElementById("options-container");
  optionsContainer.innerHTML = "";

  // ✅ Clone and shuffle options
  const options = [...original.options];
  const correctAnswerText = original.options[original.answer];
  const shuffled = options
    .map(opt => ({ text: opt, isCorrect: opt === correctAnswerText }))
    .sort(() => Math.random() - 0.5);

  // ✅ Save new shuffled correct index for current question
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
  document.getElementById("timer").innerText = `⌛Time: ${timeLeft}`;
  document.getElementById("next-btn").style.display = "none"; // Hide Next button initially

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    document.getElementById("timer").innerText = `⌛Time: ${timeLeft}`;
    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      const correctIndex = quizQuestions[currentQuestionIndex].answer;
      disableOptions(correctIndex);
      document.getElementById("feedback").innerText = `⏰ Time's up! Correct: ${quizQuestions[currentQuestionIndex].options[correctIndex]}`;
      document.getElementById("next-btn").style.display = "inline-block"; // Show Next button
    }
  }, 1000);
}

function selectAnswer(index) {
  const q = quizQuestions[currentQuestionIndex];
  const selected = q.shuffled[index];

  if (selected.isCorrect) {
    score++;
    document.getElementById("feedback").innerText = "✅ Correct!";
  } else {
    const correct = q.shuffled.find(opt => opt.isCorrect);
    document.getElementById("feedback").innerText = `❌ Wrong! Correct: ${correct.text}`;
  }

  document.getElementById("next-btn").style.display = "inline-block";
}

function disableOptions() {
  const options = document.querySelectorAll(".option");
  const q = quizQuestions[currentQuestionIndex];

  options.forEach((btn, i) => {
    btn.disabled = true;
    if (q.shuffled[i].isCorrect) {
      btn.style.background = "#a5d6a7"; // Green for correct
    } else {
      btn.style.background = "#ef9a9a"; // Red for wrong
    }
  });
}

window.nextQuestion = function () {
  currentQuestionIndex++;
  if (currentQuestionIndex >= quizQuestions.length) {
    endQuiz();
  } else {
    document.getElementById("feedback").innerText = "";
    loadQuestion();
  }
};

function endQuiz() {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("score-screen").classList.add("show");
  document.getElementById("score-text").innerText = `Your Score: ${score} / ${quizQuestions.length}`;
  document.getElementById("score-message").innerText = score >= 1 ? "🎉 Okay Na!" : "💀 Pag study balik hoi!";
}

window.returnToStart = function () {
  document.querySelectorAll(".show").forEach(el => el.classList.remove("show"));
  document.getElementById("start-screen").classList.add("show");
};

document.getElementById('theme-toggle').addEventListener('change', function () {
  document.body.classList.toggle('dark', this.checked);
});
