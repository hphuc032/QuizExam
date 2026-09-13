import { parseRaw, questionsToRaw, parseCsv, questionsToCsv, parseExcelFile } from "./modules/parser.js";
import {
  isFirebaseReady,
  signUp,
  signIn,
  signInWithGoogle,
  signOutUser,
  onAuthStateChange,
  getCurrentUserRole,
  createQuizDirect,
  updateQuizDirect,
  deleteQuizDirect,
  getQuizzesDirect,
  getQuizForAttemptDirect,
  submitQuizDirect,
  getUserAttemptsDirect,
  getUserStatsDirect
} from "./modules/firebase.js";
import {
  createQuizState,
  selectAnswer,
  submitQuiz as submitQuizLocal,
  resetQuiz,
  getTimeRemaining,
  isTimeUp,
  formatTime
} from "./modules/quizEngine.js";
import {
  renderAllQuestions,
  renderResultBox,
  updateTopMeta,
  updateSidebar,
  showNotice,
  clearNotice,
  setBusy,
  withBusy,
  scrollToFirstUnanswered,
  renderQuizList,
  renderAuthUI,
  renderStats,
  renderAttemptHistory,
  renderAttemptDetail
} from "./modules/ui.js";

const SAMPLE = `1 - Trường khóa chính là trường:
a) Single Key
b) Unique Key
c) First Key
*d) Primary Key
explanation: Khóa chính (Primary Key) là trường dùng để xác định duy nhất mỗi bản ghi trong bảng.

2 - Câu nào trong các câu dưới đây sai khi nói về hệ CSDL khách-chủ?
a) Trong kiến trúc khách-chủ, các thành phần tương tác với nhau tạo nên hệ thống gồm thành phần yêu cầu tài nguyên và thành phần cấp tài nguyên
*b) Hai thành phần yêu cầu tài nguyên và thành phần cấp tài nguyên phải cài đặt trên cùng một máy tính
c) Thành phần cấp tài nguyên thường được cài đặt tại một máy chủ trên mạng cục bộ
d) Thành phần yêu cầu tài nguyên có thể cài đặt tại nhiều máy khác trên mạng
tags: csdl, kiến trúc
difficulty: medium
explanation: Kiến trúc client-server cho phép client và server chạy trên các máy tính khác nhau, kết nối qua mạng.`;

const noticeEl = document.getElementById("notice");
const rawInputEl = document.getElementById("rawInput");
const quizTitleEl = document.getElementById("quizTitle");
const quizShellEl = document.getElementById("quizShell");
const topMetaEl = document.getElementById("topMeta");
const currentNumberEl = document.getElementById("currentNumber");
const answerStatusEl = document.getElementById("answerStatus");
const questionCardEl = document.getElementById("questionCard");
const allQuestionsEl = document.getElementById("allQuestions");
const savedListEl = document.getElementById("savedList");
const resultBoxEl = document.getElementById("resultBox");
const authContainerEl = document.getElementById("authContainer");
const statsContainerEl = document.getElementById("statsContainer");
const historyContainerEl = document.getElementById("historyContainer");
const modeSelectorEl = document.getElementById("modeSelector");
const timerEl = document.getElementById("timer");
const MAX_RAW_LENGTH = 120000;

let questions = [];
let quizState = null;
let currentFirebaseId = null;
let currentUser = null;
let currentRole = null;
let timerInterval = null;
let currentMode = "practice";
let currentAttemptId = null;

function initAuth() {
  if (!isFirebaseReady()) {
    authContainerEl.innerHTML = '<div class="small warn">Firebase chưa cấu hình. Xem config.example.js</div>';
    return;
  }

  onAuthStateChange(async (user) => {
    currentUser = user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null;
    currentRole = currentUser ? await getCurrentUserRole() : null;
    renderAuthUI(authContainerEl, currentUser, currentRole, handleSignOut);
    updateUIForRole();
    if (currentUser) {
      await loadSavedQuizzes();
      loadStats();
      loadHistory();
    }
  });
}

async function handleSignOut() {
  await signOutUser();
}

function updateUIForRole() {
  const isAdmin = currentRole === "admin";
  const builderPanel = document.querySelector(".builder");
  const adminOnlyElements = document.querySelectorAll(".admin-only");
  const studentOnlyElements = document.querySelectorAll(".student-only");

  if (builderPanel) builderPanel.style.display = isAdmin ? "grid" : "none";
  adminOnlyElements.forEach(el => el.style.display = isAdmin ? "" : "none");
  studentOnlyElements.forEach(el => el.style.display = isAdmin ? "none" : "");
}

async function handleSignIn(email, password) {
  try {
    showNotice(noticeEl, "info", "Đang đăng nhập...");
    await signIn(email, password);
    showNotice(noticeEl, "info", "Đăng nhập thành công!");
  } catch (error) {
    showNotice(noticeEl, "err", "Đăng nhập thất bại: " + error.message);
  }
}

async function handleSignUp(email, password) {
  try {
    showNotice(noticeEl, "info", "Đang đăng ký...");
    await signUp(email, password);
    showNotice(noticeEl, "info", "Đăng ký thành công! Đang đăng nhập...");
  } catch (error) {
    showNotice(noticeEl, "err", "Đăng ký thất bại: " + error.message);
  }
}

async function handleGoogleSignIn() {
  try {
    showNotice(noticeEl, "info", "Đang đăng nhập Google...");
    await signInWithGoogle();
    showNotice(noticeEl, "info", "Đăng nhập thành công!");
  } catch (error) {
    showNotice(noticeEl, "err", "Đăng nhập Google thất bại: " + error.message);
  }
}

function parseQuestions() {
  const raw = rawInputEl.value.trim();
  if (!raw) {
    showNotice(noticeEl, "warn", "Bạn chưa dán đề.");
    return;
  }

  if (raw.length > MAX_RAW_LENGTH) {
    showNotice(noticeEl, "warn", "Nội dung đề quá dài. Hãy chia thành nhiều bộ đề nhỏ hơn.");
    return;
  }

  const { questions: parsed, errors } = parseRaw(raw);
  if (!parsed.length) {
    showNotice(noticeEl, "err", "Không parse được câu hỏi nào. " + errors.slice(0, 3).join(" "));
    return;
  }

  questions = parsed;
  quizState = null;
  currentFirebaseId = null;
  resultBoxEl.style.display = "none";

  updateTopMeta(topMetaEl, quizTitleEl.value.trim() || "Bộ đề chưa đặt tên", { questions: [], userAnswers: {}, submitted: false, mode: "practice", startTime: Date.now(), questionOrder: [], optionOrders: [] });
  questionCardEl.innerHTML = `<div class="question-text">Bộ đề đã được tạo với ${parsed.length} câu hỏi. Chọn chế độ và bấm "Bắt đầu làm bài".</div>`;
  allQuestionsEl.innerHTML = "";
  quizShellEl.style.display = "grid";
  modeSelectorEl.style.display = "flex";

  showNotice(noticeEl, "info", `Đã tạo ${parsed.length} câu hỏi.${errors.length ? ` Bỏ qua ${errors.length} câu lỗi.` : ""}`);
}

function loadSample() {
  quizTitleEl.value = "Mẫu CSDL";
  rawInputEl.value = SAMPLE;
  clearNotice(noticeEl);
}

async function saveQuizToFirebase() {
  const title = quizTitleEl.value.trim();
  const raw = rawInputEl.value.trim();

  if (!title || !raw) {
    showNotice(noticeEl, "warn", "Cần tên bộ đề và nội dung đề.");
    return;
  }

  if (!isFirebaseReady()) {
    showNotice(noticeEl, "warn", "Firebase chưa cấu hình.");
    return;
  }

  if (!currentUser) {
    showNotice(noticeEl, "warn", "Cần đăng nhập để lưu đề.");
    return;
  }

  if (currentRole !== "admin") {
    showNotice(noticeEl, "warn", "Chỉ admin mới được tạo/sửa đề.");
    return;
  }

  const { questions: parsed, errors } = parseRaw(raw);
  if (!parsed.length) {
    showNotice(noticeEl, "err", "Đề không hợp lệ.");
    return;
  }

  try {
    showNotice(noticeEl, "info", "Đang lưu...");
    if (currentFirebaseId) {
      await updateQuizDirect({ quizId: currentFirebaseId, title, rawContent: raw });
    } else {
      const result = await createQuizDirect({ title, rawContent: raw, isPublished: false });
      currentFirebaseId = result.quizId;
    }
    showNotice(noticeEl, `info`, `Đã lưu${errors.length ? ` (${errors.length} câu lỗi bị bỏ qua)` : ""}`);
    await loadSavedQuizzes();
  } catch (error) {
    showNotice(noticeEl, "err", "Lưu thất bại: " + error.message);
  }
}

async function loadSavedQuizzes() {
  if (!isFirebaseReady()) {
    savedListEl.innerHTML = '<div class="small">Firebase chưa cấu hình.</div>';
    return;
  }

  try {
    savedListEl.innerHTML = '<div class="small">Đang tải...</div>';
    const { quizzes } = await getQuizzesDirect({ publishedOnly: currentRole !== "admin" });
    renderQuizList(savedListEl, quizzes, handleLoadQuiz, handleDeleteQuiz);
  } catch (error) {
    savedListEl.innerHTML = '<div class="small">Lỗi tải: ' + error.message + '</div>';
  }
}

async function handleLoadQuiz(id) {
  try {
    showNotice(noticeEl, "info", "Đang mở đề...");
    const { quiz, questionOrder, optionOrders } = await getQuizForAttemptDirect(id, currentMode);
    currentFirebaseId = id;
    questions = quiz.questions.map(q => ({
      text: q.text,
      options: q.options,
      correctIndexes: q.correctIndexes || [],
      explanation: q.explanation,
      tags: q.tags,
      difficulty: q.difficulty
    }));
    quizState = createQuizState(questions, currentMode, questionOrder, optionOrders);
    quizTitleEl.value = quiz.title;
    rawInputEl.value = questionsToRaw(questions);
    renderQuizUI();
    showNotice(noticeEl, "info", "Đã mở bộ đề.");
  } catch (error) {
    showNotice(noticeEl, "err", "Mở đề thất bại: " + error.message);
  }
}

async function handleDeleteQuiz(id) {
  if (!confirm("Xóa bộ đề này? Không thể hoàn tác.")) return;
  try {
    showNotice(noticeEl, "info", "Đang xóa...");
    await deleteQuizDirect(id);
    if (currentFirebaseId === id) currentFirebaseId = null;
    showNotice(noticeEl, "info", "Đã xóa.");
    await loadSavedQuizzes();
  } catch (error) {
    showNotice(noticeEl, "err", "Xóa thất bại: " + error.message);
  }
}

function startQuiz(mode) {
  if (!questions.length) return;
  currentMode = mode;

  if (mode === "exam" && currentFirebaseId) {
    loadQuizForExam(currentFirebaseId);
    return;
  }

  quizState = createQuizState(questions, mode);
  renderQuizUI();
  startTimerIfExam();
}

async function loadQuizForExam(quizId) {
  try {
    showNotice(noticeEl, "info", "Đang tải đề thi...");
    const { quiz, questionOrder, optionOrders } = await getQuizForAttempt(quizId, "exam");
    questions = quiz.questions.map(q => ({
      text: q.text,
      options: q.options,
      correctIndexes: q.correctIndexes || [],
      explanation: q.explanation,
      tags: q.tags,
      difficulty: q.difficulty
    }));
    quizState = createQuizState(questions, "exam", questionOrder, optionOrders);
    quizTitleEl.value = quiz.title;
    renderQuizUI();
    startTimerIfExam();
    showNotice(noticeEl, "info", "Đề thi đã sẵn sàng!");
  } catch (error) {
    showNotice(noticeEl, "err", "Tải đề thi thất bại: " + error.message);
  }
}

function renderQuizUI() {
  if (!quizState) return;

  quizShellEl.style.display = "grid";
  modeSelectorEl.style.display = "none";
  questionCardEl.innerHTML = `
    <div class="question-text">
      ${quizState.mode === "exam" ? "📝 <strong>Chế độ Thi thử</strong> - Làm bài và nộp để chấm điểm" : "📚 <strong>Chế độ Luyện tập</strong> - Phản hồi ngay sau mỗi câu"}
    </div>
  `;

  renderAllQuestions(allQuestionsEl, quizState, handleOptionSelect);
  updateTopMeta(topMetaEl, quizTitleEl.value.trim() || "Bộ đề", quizState);
  updateSidebar(currentNumberEl, answerStatusEl, quizState);
  resultBoxEl.style.display = "none";

  if (quizState.mode === "exam") {
    timerEl.style.display = "block";
    updateTimerDisplay();
  } else {
    timerEl.style.display = "none";
  }
}

function handleOptionSelect(questionIndex, optionIndex) {
  if (!quizState || quizState.submitted) return;
  selectAnswer(quizState, questionIndex, optionIndex);

  if (quizState.mode === "practice") {
    const question = quizState.questions[questionIndex];
    const selectedAnswers = quizState.userAnswers[questionIndex] || [];
    const correctIndexes = question.correctIndexes;
    const isCorrect = selectedAnswers.length === correctIndexes.length &&
      selectedAnswers.every(idx => correctIndexes.includes(idx));

    const optionEl = allQuestionsEl.querySelector(`[data-question="${questionIndex}"][data-option="${optionIndex}"]`);
    if (optionEl) {
      optionEl.classList.remove("selected");
      if (isCorrect) optionEl.classList.add("correct");
      else optionEl.classList.add("wrong");

      question.correctIndexes.forEach(cIdx => {
        const correctEl = allQuestionsEl.querySelector(`[data-question="${questionIndex}"][data-option="${cIdx}"]`);
        if (correctEl && !correctEl.classList.contains("selected")) {
          correctEl.classList.add("reveal");
        }
      });
    }

    const metaEl = document.getElementById(`meta-${questionIndex}`);
    if (metaEl) {
      metaEl.textContent = isCorrect ? `✅ Đúng!` : `❌ Sai. Đáp án đúng: ${question.correctIndexes.map(i => question.options[i]?.letter).join(", ")}`;
      if (question.explanation) {
        metaEl.innerHTML += `<br><em>Giải thích: ${question.explanation}</em>`;
      }
    }
  }

  updateTopMeta(topMetaEl, quizTitleEl.value.trim() || "Bộ đề", quizState);
  updateSidebar(currentNumberEl, answerStatusEl, quizState);
}

async function handleSubmit() {
  if (!quizState || quizState.submitted) return;

  if (quizState.mode === "practice") {
    const result = submitQuizLocal(quizState);
    renderResultBox(resultBoxEl, result);
    renderAllQuestions(allQuestionsEl, quizState, handleOptionSelect);
    resultBoxEl.scrollIntoView({ behavior: "smooth" });
    return;
  }

  if (!currentUser) {
    showNotice(noticeEl, "warn", "Cần đăng nhập để nộp bài thi.");
    return;
  }

  if (!currentFirebaseId) {
    showNotice(noticeEl, "warn", "Không tìm thấy ID đề thi.");
    return;
  }

  try {
    showNotice(noticeEl, "info", "Đang nộp bài...");
    stopTimer();

    const result = await submitQuizDirect({
      quizId: currentFirebaseId,
      answers: quizState.questions.map((_, i) => quizState.userAnswers[i] || []),
      mode: "exam",
      timeSpentSeconds: Math.floor((Date.now() - quizState.startTime) / 1000),
      questionOrder: quizState.questionOrder,
      optionOrders: quizState.optionOrders
    });

    currentAttemptId = result.attemptId;
    renderResultBox(resultBoxEl, result);
    renderAllQuestions(allQuestionsEl, quizState, handleOptionSelect);
    showNotice(noticeEl, "info", `Nộp bài thành công! Điểm: ${result.score}/100 (chờ xác thực)`);
    loadHistory();
    loadStats();
  } catch (error) {
    showNotice(noticeEl, "err", "Nộp bài thất bại: " + error.message);
  }
}

function handleReset() {
  if (!quizState) return;
  resetQuiz(quizState);
  renderQuizUI();
  stopTimer();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function startTimerIfExam() {
  if (!quizState || quizState.mode !== "exam" || !quizState.timeLimit) return;
  stopTimer();
  timerInterval = setInterval(() => {
    if (!quizState) return;
    updateTimerDisplay();
    if (isTimeUp(quizState)) {
      stopTimer();
      showNotice(noticeEl, "warn", "Hết giờ! Tự động nộp bài...");
      handleSubmit();
    }
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

function updateTimerDisplay() {
  if (!quizState) return;
  const remaining = getTimeRemaining(quizState);
  if (remaining !== null) {
    timerEl.textContent = `⏱️ ${formatTime(remaining)}`;
    timerEl.classList.toggle("warning", remaining < 60);
    timerEl.classList.toggle("danger", remaining < 10);
  }
}

async function loadStats() {
  if (!currentUser) return;
  try {
    const stats = await getUserStatsDirect();
    renderStats(statsContainerEl, stats);
  } catch (error) {
    statsContainerEl.innerHTML = '<div class="small">Lỗi tải thống kê: ' + error.message + '</div>';
  }
}

async function loadHistory() {
  if (!currentUser) return;
  try {
    const { attempts } = await getUserAttemptsDirect();
    renderAttemptHistory(historyContainerEl, attempts, handleViewAttempt);
  } catch (error) {
    historyContainerEl.innerHTML = '<div class="small">Lỗi tải lịch sử: ' + error.message + '</div>';
  }
}

async function handleViewAttempt(attemptId) {
  try {
    const { attempts } = await getUserAttemptsDirect();
    const attempt = attempts.find(a => a.id === attemptId);
    if (attempt) {
      renderAttemptDetail(historyContainerEl, attempt);
    }
  } catch (error) {
    showNotice(noticeEl, "err", "Lỗi tải chi tiết: " + error.message);
  }
}

function clearInput() {
  rawInputEl.value = "";
  quizTitleEl.value = "";
  clearNotice(noticeEl);
}

function saveDraftLocal() {
  const draft = { title: quizTitleEl.value.trim(), raw: rawInputEl.value };
  localStorage.setItem("quizlab_firebase_draft", JSON.stringify(draft));
  showNotice(noticeEl, "info", "Đã lưu nháp cục bộ.");
}

function loadDraftLocal() {
  const draft = localStorage.getItem("quizlab_firebase_draft");
  if (!draft) return;
  try {
    const data = JSON.parse(draft);
    quizTitleEl.value = data.title || "";
    rawInputEl.value = data.raw || "";
  } catch {}
}

async function handleImportFile(e) {
  const file = e.target.files[0];
  if (!file) return;

  showNotice(noticeEl, "info", "Đang đọc file...");

  try {
    let { questions: parsed, errors } = { questions: [], errors: [] };

    if (file.name.endsWith(".csv")) {
      const text = await file.text();
      ({ questions: parsed, errors } = parseCsv(text));
    } else if (file.name.match(/\.xlsx?$/)) {
      ({ questions: parsed, errors } = await parseExcelFile(file));
    } else {
      showNotice(noticeEl, "err", "Định dạng file không hỗ trợ. Chỉ chấp nhận .csv, .xlsx, .xls");
      return;
    }

    if (!parsed.length) {
      showNotice(noticeEl, "err", "Không import được câu hỏi nào. " + errors.slice(0, 3).join("; "));
      return;
    }

    questions = parsed;
    quizState = null;
    currentFirebaseId = null;
    resultBoxEl.style.display = "none";

    quizTitleEl.value = file.name.replace(/\.[^.]+$/, "");
    rawInputEl.value = questionsToRaw(questions);

    updateTopMeta(topMetaEl, quizTitleEl.value.trim() || "Bộ đề chưa đặt tên", { questions: [], userAnswers: {}, submitted: false, mode: "practice", startTime: Date.now(), questionOrder: [], optionOrders: [] });
    questionCardEl.innerHTML = `<div class="question-text">Đã import ${parsed.length} câu hỏi từ file. Chọn chế độ và bấm "Bắt đầu làm bài".</div>`;
    allQuestionsEl.innerHTML = "";
    quizShellEl.style.display = "grid";
    modeSelectorEl.style.display = "flex";

    showNotice(noticeEl, "info", `Đã import ${parsed.length} câu hỏi.${errors.length ? ` Có ${errors.length} lỗi.` : ""}`);
    e.target.value = "";
  } catch (error) {
    showNotice(noticeEl, "err", "Lỗi import: " + error.message);
  }
}

function handleExportCsv() {
  if (!questions.length) {
    showNotice(noticeEl, "warn", "Chưa có câu hỏi để xuất.");
    return;
  }

  const csv = questionsToCsv(questions);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${quizTitleEl.value.trim() || "quiz"}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
  showNotice(noticeEl, "info", "Đã xuất file CSV.");
}

document.getElementById("importFile").addEventListener("change", handleImportFile);
document.getElementById("exportCsvBtn").addEventListener("click", handleExportCsv);

document.getElementById("parseBtn").addEventListener("click", parseQuestions);
document.getElementById("sampleBtn").addEventListener("click", loadSample);
document.getElementById("draftBtn").addEventListener("click", saveDraftLocal);
document.getElementById("clearBtn").addEventListener("click", clearInput);
document.getElementById("saveFirebaseBtn").addEventListener("click", () => withBusy(saveQuizToFirebase));
document.getElementById("deleteCurrentBtn").addEventListener("click", () => withBusy(async () => {
  if (!currentFirebaseId) { showNotice(noticeEl, "warn", "Chưa mở đề nào."); return; }
  await handleDeleteQuiz(currentFirebaseId);
}));
document.getElementById("refreshSavedBtn").addEventListener("click", () => withBusy(loadSavedQuizzes));
document.getElementById("firstUnansweredBtn").addEventListener("click", () => scrollToFirstUnanswered(quizState));
document.getElementById("submitBtn").addEventListener("click", handleSubmit);
document.getElementById("resetBtn").addEventListener("click", handleReset);
document.getElementById("practiceModeBtn").addEventListener("click", () => startQuiz("practice"));
document.getElementById("examModeBtn").addEventListener("click", () => startQuiz("exam"));

authContainerEl.addEventListener("click", async (e) => {
  const target = e.target;
  if (target.id === "signInBtn") {
    const email = document.getElementById("emailInput").value;
    const password = document.getElementById("passwordInput").value;
    await handleSignIn(email, password);
  } else if (target.id === "signUpBtn") {
    const email = document.getElementById("signupEmailInput").value;
    const password = document.getElementById("signupPasswordInput").value;
    await handleSignUp(email, password);
  } else if (target.id === "googleSignInBtn") {
    await handleGoogleSignIn();
  }
});

loadDraftLocal();
initAuth();