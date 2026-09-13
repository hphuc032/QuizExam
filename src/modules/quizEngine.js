function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function createQuizState(parsedQuestions, mode, questionOrder, optionOrders, timeLimit) {
  let questions;
  let finalQuestionOrder;
  let finalOptionOrders;

  if (mode === "exam" && (!questionOrder || !optionOrders)) {
    const shuffledQuestions = shuffleArray(parsedQuestions.map((q, i) => ({ q, originalIndex: i })));
    questions = shuffledQuestions.map((sq, newIndex) => ({
      ...sq.q,
      originalIndex: sq.originalIndex,
      optionOrder: shuffleArray(sq.q.options.map((_, i) => i))
    }));
    finalQuestionOrder = shuffledQuestions.map(sq => sq.originalIndex);
    finalOptionOrders = questions.map(q => q.optionOrder);
  } else {
    questions = parsedQuestions.map((q, i) => ({
      ...q,
      originalIndex: i,
      optionOrder: (optionOrders && optionOrders[i]) ? optionOrders[i] : q.options.map((_, idx) => idx)
    }));
    finalQuestionOrder = questionOrder || parsedQuestions.map((_, i) => i);
    finalOptionOrders = optionOrders || parsedQuestions.map(q => q.options.map((_, idx) => idx));
  }

  return {
    questions,
    userAnswers: {},
    submitted: false,
    mode,
    startTime: Date.now(),
    timeLimit,
    questionOrder: finalQuestionOrder,
    optionOrders: finalOptionOrders
  };
}

export function getSelectedAnswers(state, questionIndex) {
  return Array.isArray(state.userAnswers[questionIndex]) ? state.userAnswers[questionIndex] : [];
}

export function getCorrectAnswers(question) {
  return question.correctIndexes;
}

export function isQuestionAnswered(state, questionIndex) {
  return getSelectedAnswers(state, questionIndex).length > 0;
}

export function allowsMultipleAnswers(question) {
  return getCorrectAnswers(question).length > 1;
}

export function hasExactAnswers(question, selectedAnswers) {
  const correctAnswers = getCorrectAnswers(question);
  if (selectedAnswers.length !== correctAnswers.length) return false;
  const selectedSet = new Set(selectedAnswers);
  return correctAnswers.every(index => selectedSet.has(index));
}

export function formatAnswerLetters(question, indexes) {
  return indexes
    .map(index => question.options[index]?.letter)
    .filter(Boolean)
    .join(", ");
}

export function selectAnswer(state, questionIndex, optionIndex) {
  if (state.submitted) return;

  const question = state.questions[questionIndex];
  const isMulti = allowsMultipleAnswers(question);
  const currentAnswers = getSelectedAnswers(state, questionIndex);

  if (isMulti) {
    const selectedSet = new Set(currentAnswers);
    if (selectedSet.has(optionIndex)) {
      selectedSet.delete(optionIndex);
    } else {
      selectedSet.add(optionIndex);
    }
    const nextAnswers = [...selectedSet].sort((a, b) => a - b);
    if (nextAnswers.length) {
      state.userAnswers[questionIndex] = nextAnswers;
    } else {
      delete state.userAnswers[questionIndex];
    }
  } else {
    state.userAnswers[questionIndex] = [optionIndex];
  }
}

export function submitQuiz(state) {
  state.submitted = true;
  const timeSpentSeconds = Math.floor((Date.now() - state.startTime) / 1000);

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const questionResults = [];

  state.questions.forEach((question, index) => {
    const selectedAnswers = getSelectedAnswers(state, index);
    const correctIndexes = getCorrectAnswers(question);
    const isCorrect = selectedAnswers.length > 0 &&
      selectedAnswers.length === correctIndexes.length &&
      selectedAnswers.every(idx => correctIndexes.includes(idx));

    if (selectedAnswers.length === 0) {
      unansweredCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      wrongCount++;
    }

    const originalQuestionIndex = state.questionOrder[index] ?? index;
    const optionOrder = state.optionOrders[index];

    let displaySelected = selectedAnswers;
    let displayCorrect = correctIndexes;

    if (optionOrder) {
      displaySelected = selectedAnswers.map(idx => optionOrder[idx]).filter(v => v !== undefined);
      displayCorrect = correctIndexes.map(idx => optionOrder[idx]).filter(v => v !== undefined);
    }

    questionResults.push({
      questionIndex: originalQuestionIndex,
      questionText: question.text,
      selectedIndexes: displaySelected,
      correctIndexes: displayCorrect,
      isCorrect,
      explanation: question.explanation
    });
  });

  const totalQuestions = state.questions.length;
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return {
    score,
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    questionResults,
    timeSpentSeconds
  };
}

export function resetQuiz(state) {
  state.submitted = false;
  state.userAnswers = {};
  state.startTime = Date.now();
}

export function getTimeRemaining(state) {
  if (!state.timeLimit) return null;
  const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
  return Math.max(0, state.timeLimit - elapsed);
}

export function isTimeUp(state) {
  const remaining = getTimeRemaining(state);
  return remaining !== null && remaining <= 0;
}

export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}