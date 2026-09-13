function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """);
}

function buildOptionHtml(question, questionIndex, option, optionIndex, state) {
  const selectedAnswers = state.userAnswers[questionIndex] || [];
  const isChosen = selectedAnswers.includes(optionIndex);
  const isMulti = question.correctIndexes.length > 1;
  const inputType = isMulti ? "checkbox" : "radio";
  const classes = ["option"];

  if (isChosen) classes.push("selected");

  if (state.submitted) {
    const correctIndexes = question.correctIndexes;
    const isCorrectOption = correctIndexes.includes(optionIndex);

    if (isChosen && isCorrectOption) classes.push("correct");
    if (isChosen && !isCorrectOption) classes.push("wrong");
    if (!isChosen && isCorrectOption) classes.push("reveal");
  }

  return `
    <label class="${classes.join(" ")}" data-question="${questionIndex}" data-option="${optionIndex}">
      <input type="${inputType}" name="answer-${questionIndex}" value="${optionIndex}" ${isChosen ? "checked" : ""} ${state.submitted ? "disabled" : ""}>
      <div class="letter">${option.letter}.</div>
      <div>${escapeHtml(option.text)}</div>
    </label>
  `;
}

function buildQuestionMeta(question, questionIndex, state) {
  const selectedAnswers = state.userAnswers[questionIndex] || [];
  const selectedLetters = selectedAnswers.map(idx => question.options[idx]?.letter).filter(Boolean).join(", ");
  const correctLetters = question.correctIndexes.map(idx => question.options[idx]?.letter).filter(Boolean).join(", ");

  if (!state.submitted) {
    if (!selectedAnswers.length) return "Chưa trả lời";
    return `Đã chọn đáp án ${selectedLetters}`;
  }

  if (!selectedAnswers.length) {
    return `Chưa trả lời • Đáp án đúng là ${correctLetters || "?"}`;
  }

  const correctAnswers = question.correctIndexes;
  const isCorrect = selectedAnswers.length === correctAnswers.length &&
    selectedAnswers.every(idx => correctAnswers.includes(idx));

  if (isCorrect) {
    return `Đúng • Bạn đã chọn ${selectedLetters}`;
  }

  return `Sai • Bạn chọn ${selectedLetters} • Đáp án đúng là ${correctLetters || "?"}`;
}

export function renderQuestionCard(question, questionIndex, state, onOptionClick) {
  const resultClass = state.submitted
    ? (() => {
        const selected = state.userAnswers[questionIndex] || [];
        if (!selected.length) return "wrong-block";
        const correct = question.correctIndexes;
        return selected.length === correct.length && selected.every(idx => correct.includes(idx)) ? "correct-block" : "wrong-block";
      })()
    : "";

  const meta = buildQuestionMeta(question, questionIndex, state);

  return `
    <div class="question-card question-block ${resultClass}" id="question-${questionIndex}">
      <div class="question-head">
        <div class="question-index">Câu ${questionIndex + 1}</div>
        <div class="question-body">${escapeHtml(question.text)}</div>
      </div>
      <div class="option-list">
        ${question.options.map((option, optionIndex) => buildOptionHtml(question, questionIndex, option, optionIndex, state)).join("")}
      </div>
      ${state.submitted && question.explanation ? `<div class="explanation"><strong>Giải thích:</strong> ${escapeHtml(question.explanation)}</div>` : ""}
      <div class="question-meta" id="meta-${questionIndex}">${meta}</div>
    </div>
  `;
}

export function renderAllQuestions(container, state, onOptionClick) {
  if (!state.questions.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = state.questions.map((question, index) =>
    renderQuestionCard(question, index, state, onOptionClick)
  ).join("");

  if (!state.submitted) {
    container.querySelectorAll(".option input").forEach(input => {
      input.addEventListener("change", (e) => {
        const target = e.target;
        const qIdx = parseInt(target.name.replace("answer-", ""), 10);
        const oIdx = parseInt(target.value, 10);
        onOptionClick(qIdx, oIdx);
      });
    });
  }
}

export function renderResultBox(container, result) {
  container.innerHTML = `
    <h3>Kết quả</h3>
    <div class="result-summary small">Bạn làm đúng ${result.correctCount}/${result.totalQuestions} câu. Câu chưa làm được tính là sai khi quy đổi điểm.</div>
    <div class="result-grid">
      <div class="result-mini"><strong>${result.totalQuestions}</strong>Tổng câu</div>
      <div class="result-mini"><strong>${result.correctCount}</strong>Đúng</div>
      <div class="result-mini"><strong>${result.wrongCount}</strong>Sai</div>
      <div class="result-mini"><strong>${result.score}</strong>Điểm / 100</div>
    </div>
  `;
  container.style.display = "block";
}

export function updateTopMeta(element, title, state) {
  if (!state.questions.length) {
    element.textContent = "Chưa có đề nào được tạo";
    return;
  }

  const answered = Object.keys(state.userAnswers).filter(idx => state.userAnswers[parseInt(idx)].length > 0).length;
  element.textContent = `${title} • ${state.questions.length} câu • Đã làm ${answered}/${state.questions.length}`;
}

export function updateSidebar(currentNumberEl, answerStatusEl, state) {
  currentNumberEl.textContent = String(state.questions.length);
  const answered = Object.keys(state.userAnswers).filter(idx => state.userAnswers[parseInt(idx)].length > 0).length;
  answerStatusEl.textContent = `Đã trả lời ${answered}/${state.questions.length} câu`;
}

export function showNotice(noticeEl, type, text) {
  noticeEl.replaceChildren();
  const message = document.createElement("div");
  message.className = `notice ${type}`;
  message.textContent = text;
  noticeEl.append(message);
}

export function clearNotice(noticeEl) {
  noticeEl.replaceChildren();
}

export function setBusy(isBusy) {
  document.querySelectorAll("[data-busy-control]").forEach(button => {
    button.disabled = isBusy;
    button.classList.toggle("is-busy", isBusy);
  });
}

export async function withBusy(action) {
  setBusy(true);
  try {
    return await action();
  } finally {
    setBusy(false);
  }
}

export function scrollToFirstUnanswered(state) {
  const index = state.questions.findIndex((_, idx) => !state.userAnswers[idx]?.length);
  if (index === -1) return;
  const element = document.getElementById(`question-${index}`);
  if (element) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function renderQuizList(container, quizzes, onLoad, onDelete) {
  if (!quizzes.length) {
    container.innerHTML = '<div class="small">Chưa có bộ đề nào.</div>';
    return;
  }

  container.innerHTML = quizzes.map(item => `
    <div class="saved-item">
      <h4>${escapeHtml(item.title || "Không tên")}</h4>
      <div class="meta">
        ${Number(item.questionCount || 0)} câu
        ${item.tags?.length ? ` • Tags: ${item.tags.map(escapeHtml).join(", ")}` : ""}
        ${item.isPublished !== undefined ? ` • ${item.isPublished ? "Đã phát hành" : "Nháp"}` : ""}
        • Cập nhật: ${escapeHtml(String(item.updatedAt || "").replace("T", " ").slice(0, 16))}
      </div>
      <div class="actions">
        <button class="btn-soft" type="button" data-busy-control data-load="${escapeHtml(item.id)}">Mở</button>
        <button class="btn-danger" type="button" data-busy-control data-delete="${escapeHtml(item.id)}">Xóa</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("[data-load]").forEach(button => {
    button.addEventListener("click", () => onLoad(button.dataset.load));
  });
  container.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", () => onDelete(button.dataset.delete));
  });
}

export function renderAuthUI(container, user, role, onSignOut) {
  if (user) {
    container.innerHTML = `
      <div class="user-info">
        <span>👤 ${escapeHtml(user.displayName || user.email || "User")}</span>
        <span class="role-badge ${role}">${role === "admin" ? "👑 Admin" : "🎓 Học sinh"}</span>
        <button id="signOutBtn" class="btn-soft" type="button">Đăng xuất</button>
      </div>
    `;
    document.getElementById("signOutBtn")?.addEventListener("click", onSignOut);
  } else {
    container.innerHTML = `
      <div class="auth-form">
        <div class="auth-tabs">
          <button class="auth-tab active" data-tab="signin">Đăng nhập</button>
          <button class="auth-tab" data-tab="signup">Đăng ký</button>
        </div>
        <div class="auth-panel" id="signinPanel">
          <input id="emailInput" type="email" placeholder="Email" />
          <input id="passwordInput" type="password" placeholder="Mật khẩu" />
          <button id="signInBtn" class="btn-primary" type="button">Đăng nhập</button>
          <button id="googleSignInBtn" class="btn-soft" type="button">Đăng nhập Google</button>
        </div>
        <div class="auth-panel" id="signupPanel" style="display:none">
          <input id="signupEmailInput" type="email" placeholder="Email" />
          <input id="signupPasswordInput" type="password" placeholder="Mật khẩu (tối thiểu 6 ký tự)" />
          <button id="signUpBtn" class="btn-primary" type="button">Đăng ký</button>
        </div>
      </div>
    `;

    document.querySelectorAll(".auth-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".auth-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const target = tab.dataset.tab;
        document.getElementById("signinPanel").style.display = target === "signin" ? "block" : "none";
        document.getElementById("signupPanel").style.display = target === "signup" ? "block" : "none";
      });
    });
  }
}

export function renderStats(container, stats) {
  container.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><strong>${stats.totalAttempts}</strong><span>Lần làm bài</span></div>
      <div class="stat-card"><strong>${stats.totalQuestions}</strong><span>Tổng câu hỏi</span></div>
      <div class="stat-card"><strong>${stats.averageScore}</strong><span>Điểm trung bình</span></div>
      <div class="stat-card"><strong>${stats.bestScore}</strong><span>Điểm cao nhất</span></div>
      <div class="stat-card"><strong>${stats.practiceAttempts}</strong><span>Luyện tập</span></div>
      <div class="stat-card"><strong>${stats.examAttempts}</strong><span>Thi thử</span></div>
    </div>
    ${Object.keys(stats.byTag).length ? `
      <h4>Theo chủ đề</h4>
      <div class="stats-list">
        ${Object.entries(stats.byTag).map(([tag, data]) => `
          <div class="stat-row"><span>${escapeHtml(tag)}</span><span>${data.attempts} lần • TB: ${data.avgScore.toFixed(1)}</span></div>
        `).join("")}
      </div>
    ` : ""}
    ${Object.keys(stats.byDifficulty).length ? `
      <h4>Theo độ khó</h4>
      <div class="stats-list">
        ${Object.entries(stats.byDifficulty).map(([diff, data]) => `
          <div class="stat-row"><span>${escapeHtml(diff)}</span><span>${data.attempts} lần • TB: ${data.avgScore.toFixed(1)}</span></div>
        `).join("")}
      </div>
    ` : ""}
    ${stats.recentActivity.length ? `
      <h4>Hoạt động gần đây</h4>
      <div class="activity-list">
        ${stats.recentActivity.map(a => `
          <div class="activity-item">
            <span>${escapeHtml(a.quizTitle)}</span>
            <span>${new Date(a.date).toLocaleDateString("vi-VN")}</span>
            <span class="score">${a.score}%</span>
          </div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

export function renderAttemptHistory(container, attempts, onView) {
  if (!attempts.length) {
    container.innerHTML = '<div class="small">Chưa có lịch sử làm bài.</div>';
    return;
  }

  container.innerHTML = attempts.map(a => `
    <div class="attempt-item" data-attempt="${escapeHtml(a.id)}">
      <div class="attempt-main">
        <strong>${escapeHtml(a.quizTitle)}</strong>
        <span class="mode-badge ${a.mode}">${a.mode === "practice" ? "📚 Luyện tập" : "📝 Thi thử"}</span>
        ${a.verified === false ? '<span class="verified-badge unverified">⏳ Chờ xác thực</span>' : a.verified ? '<span class="verified-badge verified">✅ Đã xác thực</span>' : ''}
      </div>
      <div class="attempt-meta">
        <span>${new Date(a.completedAt).toLocaleString("vi-VN")}</span>
        <span>${a.correctCount}/${a.totalQuestions} đúng</span>
        <span class="score">${a.score}%</span>
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".attempt-item").forEach(item => {
    item.addEventListener("click", () => onView(item.dataset.attempt));
  });
}

export function renderAttemptDetail(container, attempt) {
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  container.innerHTML = `
    <div class="attempt-detail-header">
      <h3>${escapeHtml(attempt.quizTitle)}</h3>
      <div class="attempt-summary">
        <span class="mode-badge ${attempt.mode}">${attempt.mode === "practice" ? "📚 Luyện tập" : "📝 Thi thử"}</span>
        <span class="score-large">${attempt.score}%</span>
      </div>
      <div class="attempt-meta-detail">
        <span>📊 ${attempt.correctCount}/${attempt.totalQuestions} đúng</span>
        <span>⏱️ ${formatTime(attempt.timeSpentSeconds)}</span>
        <span>📅 ${new Date().toLocaleString("vi-VN")}</span>
      </div>
    </div>
    <div class="attempt-questions">
      ${attempt.questionResults.map((qr, idx) => `
        <div class="question-review ${qr.isCorrect ? "correct" : "wrong"}" id="review-${idx}">
          <div class="review-header">
            <span class="q-number">Câu ${idx + 1}</span>
            <span class="q-result">${qr.isCorrect ? "✅ Đúng" : qr.selectedIndexes.length ? "❌ Sai" : "⭕ Chưa làm"}</span>
          </div>
          <div class="q-text">${escapeHtml(qr.questionText)}</div>
          <div class="q-answers">
            ${qr.selectedIndexes.length ? `
              <div class="your-answer">
                <strong>Bạn chọn:</strong> ${qr.selectedIndexes.map(i => String.fromCharCode(65 + i)).join(", ")}
              </div>
            ` : '<div class="your-answer"><strong>Bạn chọn:</strong> (chưa trả lời)</div>'}
            <div class="correct-answer">
              <strong>Đáp án đúng:</strong> ${qr.correctIndexes.map(i => String.fromCharCode(65 + i)).join(", ")}
            </div>
            ${qr.explanation ? `<div class="explanation"><strong>Giải thích:</strong> ${escapeHtml(qr.explanation)}</div>` : ""}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}