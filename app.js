import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase, ref, push, set, get, child, remove } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFOd3beHY6b7ENqFFBSyAShSK5O2YDD_c",
  authDomain: "quizexam-8f27d.firebaseapp.com",
  databaseURL: "https://quizexam-8f27d-default-rtdb.asia-southeast1.firebasedatabase.app/",
  projectId: "quizexam-8f27d",
  storageBucket: "quizexam-8f27d.firebasestorage.app",
  messagingSenderId: "623038604901",
  appId: "1:623038604901:web:20b4f081882ff072d6c88c"
};

const firebaseReady = !Object.values(firebaseConfig).some(value => String(value).includes("YOUR_"));
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let questions = [];
let currentIndex = 0;
let submitted = false;
let currentFirebaseId = null;
let flagged = {};
let userAnswers = {};

const SAMPLE = `1 - Trường khóa chính là trường:
[a]--Single Key
[b]--Unique Key
[c]--First Key
*[d]--Primary Key

2 - Câu nào trong các câu dưới đây sai khi nói về hệ CSDL khách-chủ?
[a]--Trong kiến trúc khách-chủ, các thành phần tương tác với nhau tạo nên hệ thống gồm thành phần yêu cầu tài nguyên và thành phần cấp tài nguyên
*[b]--Hai thành phần yêu cầu tài nguyên và thành phần cấp tài nguyên phải cài đặt trên cùng một máy tính
[c]--Thành phần cấp tài nguyên thường được cài đặt tại một máy chủ trên mạng cục bộ
[d]--Thành phần yêu cầu tài nguyên có thể cài đặt tại nhiều máy khác trên mạng`;

const noticeEl = document.getElementById("notice");
const rawInputEl = document.getElementById("rawInput");
const quizTitleEl = document.getElementById("quizTitle");
const quizShellEl = document.getElementById("quizShell");
const topMetaEl = document.getElementById("topMeta");
const currentNumberEl = document.getElementById("currentNumber");
const answerStatusEl = document.getElementById("answerStatus");
const questionTextEl = document.getElementById("questionText");
const optionListEl = document.getElementById("optionList");
const savedListEl = document.getElementById("savedList");
const resultBoxEl = document.getElementById("resultBox");

function showNotice(type, text) {
  noticeEl.innerHTML = `<div class="notice ${type}">${text}</div>`;
}

function clearNotice() {
  noticeEl.innerHTML = "";
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalizeText(raw) {
  return String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isQuestionHeader(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  return /^câu\s*\d+\s*[:.)-]/i.test(trimmed)
    || /^question\s*\d+\s*[:.)-]/i.test(trimmed)
    || /^\d+\s*[-:.)]/.test(trimmed);
}

function parseQuestionText(line) {
  return line
    .replace(/^câu\s*\d+\s*[:.)-]\s*/i, "")
    .replace(/^question\s*\d+\s*[:.)-]\s*/i, "")
    .replace(/^\d+\s*[-:.)]\s*/, "")
    .replace(/\*+\s*$/, "")
    .trim();
}

function parseOptionLine(line) {
  const trimmed = line.trim();
  let match = trimmed.match(/^(\*)?\s*\[([a-dA-D])\]\s*--\s*(.+)$/);
  if (match) {
    return {
      correct: Boolean(match[1]),
      letter: match[2].toUpperCase(),
      text: match[3].trim()
    };
  }

  match = trimmed.match(/^(\*)?\s*([a-dA-D])\s*[.)-]\s*(.+)$/);
  if (match) {
    return {
      correct: Boolean(match[1]),
      letter: match[2].toUpperCase(),
      text: match[3].trim()
    };
  }

  return null;
}

function parseRaw(raw) {
  const lines = normalizeText(raw).split("\n");
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (isQuestionHeader(line)) {
      if (current) blocks.push(current);
      current = [line.trim()];
    } else if (current && line.trim()) {
      current.push(line.trim());
    }
  }

  if (current) blocks.push(current);

  const parsed = [];
  let errorCount = 0;

  for (const block of blocks) {
    const question = parseQuestionText(block[0]);
    if (!question) {
      errorCount += 1;
      continue;
    }

    const options = [];
    for (const rawLine of block.slice(1)) {
      const parsedOption = parseOptionLine(rawLine);
      if (parsedOption) {
        options.push(parsedOption);
      } else if (options.length > 0) {
        options[options.length - 1].text += " " + rawLine.trim();
      }
    }

    const correctCount = options.filter(option => option.correct).length;
    if (options.length < 2 || correctCount !== 1) {
      errorCount += 1;
      continue;
    }

    parsed.push({ text: question, options });
  }

  return { parsed, errorCount };
}

function updateTopMeta() {
  if (!questions.length) {
    topMetaEl.textContent = "Chưa có đề nào được tạo";
    return;
  }

  const answered = Object.keys(userAnswers).length;
  const title = quizTitleEl.value.trim() || "Bộ đề chưa đặt tên";
  topMetaEl.textContent = `${title} • ${questions.length} câu • Đã làm ${answered}/${questions.length}`;
}

function renderQuestion() {
  if (!questions.length) return;

  quizShellEl.style.display = "grid";
  const question = questions[currentIndex];
  currentNumberEl.textContent = String(currentIndex + 1);

  if (userAnswers[currentIndex] === undefined) {
    answerStatusEl.textContent = "Chưa trả lời";
  } else {
    answerStatusEl.textContent = `Đã chọn đáp án ${question.options[userAnswers[currentIndex]].letter}`;
  }

  if (flagged[currentIndex]) {
    answerStatusEl.textContent += " • Đã đặt cờ";
  }

  questionTextEl.innerHTML = escapeHtml(question.text);
  optionListEl.innerHTML = "";

  question.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "option";

    if (userAnswers[currentIndex] === index) {
      label.classList.add("selected");
    }

    if (submitted) {
      const isChosen = userAnswers[currentIndex] === index;
      if (option.correct && !isChosen) label.classList.add("reveal");
      if (isChosen && option.correct) label.classList.add("correct");
      if (isChosen && !option.correct) label.classList.add("wrong");
    }

    label.innerHTML = `
      <input type="radio" name="answer" ${userAnswers[currentIndex] === index ? "checked" : ""} ${submitted ? "disabled" : ""}>
      <div class="letter">${option.letter}.</div>
      <div>${escapeHtml(option.text)}</div>
    `;

    if (!submitted) {
      label.addEventListener("click", () => {
        userAnswers[currentIndex] = index;
        updateTopMeta();
        renderQuestion();
      });
    }

    optionListEl.appendChild(label);
  });
}

function parseQuestions() {
  const raw = rawInputEl.value.trim();
  if (!raw) {
    showNotice("warn", "Bạn chưa dán đề.");
    return;
  }

  const { parsed, errorCount } = parseRaw(raw);
  if (!parsed.length) {
    showNotice("err", "Không parse được câu hỏi nào. Hãy kiểm tra lại format.");
    return;
  }

  questions = parsed;
  currentIndex = 0;
  submitted = false;
  currentFirebaseId = null;
  flagged = {};
  userAnswers = {};
  resultBoxEl.style.display = "none";

  updateTopMeta();
  renderQuestion();
  showNotice("info", `Đã tạo ${parsed.length} câu hỏi.${errorCount ? ` Bỏ qua ${errorCount} câu lỗi format.` : ""}`);
}

function prevQuestion() {
  if (!questions.length) return;
  currentIndex = Math.max(0, currentIndex - 1);
  renderQuestion();
}

function nextQuestion() {
  if (!questions.length) return;
  currentIndex = Math.min(questions.length - 1, currentIndex + 1);
  renderQuestion();
}

function toggleFlag() {
  if (!questions.length) return;
  flagged[currentIndex] = !flagged[currentIndex];
  renderQuestion();
}

function jumpToUnanswered() {
  const index = questions.findIndex((_, idx) => userAnswers[idx] === undefined);
  if (index === -1) {
    showNotice("info", "Bạn đã trả lời hết các câu.");
    return;
  }

  currentIndex = index;
  renderQuestion();
}

function submitQuiz() {
  if (!questions.length) return;

  submitted = true;
  renderQuestion();

  let correct = 0;
  let wrong = 0;

  questions.forEach((question, index) => {
    const chosen = userAnswers[index];
    if (chosen === undefined) return;
    if (question.options[chosen].correct) correct += 1;
    else wrong += 1;
  });

  const total = questions.length;
  const score = total ? ((correct / total) * 10).toFixed(1) : "0.0";

  document.getElementById("rTotal").textContent = String(total);
  document.getElementById("rCorrect").textContent = String(correct);
  document.getElementById("rWrong").textContent = String(wrong);
  document.getElementById("rScore").textContent = String(score);
  document.getElementById("resultSummary").textContent = `Bạn làm đúng ${correct}/${total} câu. Câu chưa làm được tính là sai khi quy đổi điểm.`;
  resultBoxEl.style.display = "block";
}

function resetQuiz() {
  if (!questions.length) return;

  submitted = false;
  userAnswers = {};
  flagged = {};
  currentIndex = 0;
  resultBoxEl.style.display = "none";

  updateTopMeta();
  renderQuestion();
}

function clearInput() {
  rawInputEl.value = "";
  quizTitleEl.value = "";
  clearNotice();
}

function loadSample() {
  quizTitleEl.value = "Mẫu CSDL";
  rawInputEl.value = SAMPLE;
  clearNotice();
}

function saveDraftLocal() {
  const draft = {
    title: quizTitleEl.value.trim(),
    raw: rawInputEl.value
  };

  localStorage.setItem("quizlab_firebase_draft", JSON.stringify(draft));
  showNotice("info", "Đã lưu nháp trên trình duyệt này.");
}

function loadDraftLocal() {
  const draft = localStorage.getItem("quizlab_firebase_draft");
  if (!draft) return;

  try {
    const data = JSON.parse(draft);
    quizTitleEl.value = data.title || "";
    rawInputEl.value = data.raw || "";
  } catch {
    // bỏ qua nháp lỗi JSON
  }
}

async function saveQuizToFirebase() {
  const title = quizTitleEl.value.trim();
  const raw = rawInputEl.value.trim();

  if (!title || !raw) {
    showNotice("warn", "Bạn cần nhập tên bộ đề và nội dung đề trước khi lưu.");
    return;
  }

  if (!firebaseReady) {
    showNotice("warn", "Bạn chưa thay firebaseConfig. Hãy sửa config trước.");
    return;
  }

  const { parsed, errorCount } = parseRaw(raw);
  if (!parsed.length) {
    showNotice("err", "Đề không hợp lệ nên chưa thể lưu Firebase.");
    return;
  }

  try {
    if (currentFirebaseId) {
      await set(ref(db, `quizzes/${currentFirebaseId}`), {
        title,
        raw,
        questionCount: parsed.length,
        updatedAt: new Date().toISOString()
      });
    } else {
      const newRef = push(ref(db, "quizzes"));
      await set(newRef, {
        title,
        raw,
        questionCount: parsed.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      currentFirebaseId = newRef.key;
    }

    showNotice("info", `Đã lưu bộ đề lên Firebase.${errorCount ? ` Có ${errorCount} câu lỗi bị bỏ qua khi parse.` : ""}`);
    await loadSavedQuizzes();
  } catch (error) {
    showNotice("err", "Lưu Firebase thất bại: " + error.message);
  }
}

async function loadSavedQuizzes() {
  if (!firebaseReady) {
    savedListEl.innerHTML = '<div class="small">Bạn chưa cấu hình Firebase.</div>';
    return;
  }

  try {
    const snapshot = await get(child(ref(db), "quizzes"));
    if (!snapshot.exists()) {
      savedListEl.innerHTML = '<div class="small">Chưa có bộ đề nào trong Firebase.</div>';
      return;
    }

    const items = [];
    snapshot.forEach(item => {
      items.push({ id: item.key, ...item.val() });
    });

    items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

    savedListEl.innerHTML = items.map(item => `
      <div class="saved-item">
        <h4>${escapeHtml(item.title || "Không tên")}</h4>
        <div class="meta">${item.questionCount || 0} câu • Cập nhật: ${escapeHtml(String(item.updatedAt || "").replace("T", " ").slice(0, 16))}</div>
        <div class="actions">
          <button class="btn-soft" data-load="${item.id}">Mở</button>
          <button class="btn-danger" data-delete="${item.id}">Xóa</button>
        </div>
      </div>
    `).join("");

    savedListEl.querySelectorAll("[data-load]").forEach(button => {
      button.addEventListener("click", () => loadQuizFromFirebase(button.dataset.load));
    });

    savedListEl.querySelectorAll("[data-delete]").forEach(button => {
      button.addEventListener("click", () => deleteQuizById(button.dataset.delete));
    });
  } catch (error) {
    savedListEl.innerHTML = '<div class="small">Không tải được danh sách: ' + escapeHtml(error.message) + '</div>';
  }
}

async function loadQuizFromFirebase(id) {
  if (!firebaseReady) return;

  try {
    const snapshot = await get(child(ref(db), `quizzes/${id}`));
    if (!snapshot.exists()) {
      showNotice("warn", "Không tìm thấy bộ đề này.");
      return;
    }

    const data = snapshot.val();
    currentFirebaseId = id;
    quizTitleEl.value = data.title || "";
    rawInputEl.value = data.raw || "";
    parseQuestions();
    currentFirebaseId = id;
    showNotice("info", "Đã mở bộ đề từ Firebase.");
  } catch (error) {
    showNotice("err", "Mở bộ đề thất bại: " + error.message);
  }
}

async function deleteQuizById(id) {
  if (!firebaseReady) return;

  const confirmed = window.confirm("Xóa bộ đề này khỏi Firebase?");
  if (!confirmed) return;

  try {
    await remove(ref(db, `quizzes/${id}`));
    if (currentFirebaseId === id) currentFirebaseId = null;
    showNotice("info", "Đã xóa bộ đề.");
    await loadSavedQuizzes();
  } catch (error) {
    showNotice("err", "Xóa thất bại: " + error.message);
  }
}

async function deleteCurrentFirebaseQuiz() {
  if (!currentFirebaseId) {
    showNotice("warn", "Hiện chưa mở bộ đề nào từ Firebase.");
    return;
  }

  await deleteQuizById(currentFirebaseId);
}

window.parseQuestions = parseQuestions;
window.loadSample = loadSample;
window.clearInput = clearInput;
window.saveDraftLocal = saveDraftLocal;
window.saveQuizToFirebase = saveQuizToFirebase;
window.deleteCurrentFirebaseQuiz = deleteCurrentFirebaseQuiz;
window.loadSavedQuizzes = loadSavedQuizzes;
window.prevQuestion = prevQuestion;
window.nextQuestion = nextQuestion;
window.submitQuiz = submitQuiz;
window.resetQuiz = resetQuiz;
window.toggleFlag = toggleFlag;
window.jumpToUnanswered = jumpToUnanswered;

loadDraftLocal();
loadSavedQuizzes();
