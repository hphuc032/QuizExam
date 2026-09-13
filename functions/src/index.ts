import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.database();

export interface QuestionOption {
  letter: string;
  text: string;
}

export interface ParsedQuestion {
  text: string;
  options: QuestionOption[];
  correctIndexes: number[];
  explanation?: string;
  tags?: string[];
  difficulty?: "easy" | "medium" | "hard";
}

export interface PublicQuiz {
  title: string;
  questions: ParsedQuestion[];
  questionCount: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  tags?: string[];
  isPublished: boolean;
}

export interface AnswerKey {
  quizId: string;
  correctAnswers: number[][];
  createdAt: string;
}

export interface UserAttempt {
  userId: string;
  quizId: string;
  quizTitle: string;
  mode: "practice" | "exam";
  answers: number[][];
  score: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeSpentSeconds: number;
  startedAt: string;
  completedAt: string;
  questionResults: QuestionResult[];
}

export interface QuestionResult {
  questionIndex: number;
  questionText: string;
  selectedIndexes: number[];
  correctIndexes: number[];
  isCorrect: boolean;
  explanation?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  role: "admin" | "student";
  createdAt: string;
  lastLoginAt: string;
}

function assertAdmin(auth: functions.https.CallableContext | undefined): void {
  if (!auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }
  const customClaims = auth.token as Record<string, unknown>;
  if (customClaims.role !== "admin") {
    throw new functions.https.HttpsError("permission-denied", "Admin access required");
  }
}

function assertAuthenticated(auth: functions.https.CallableContext | undefined): string {
  if (!auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required");
  }
  return auth.uid;
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export const submitQuiz = functions.https.onCall(async (data, context) => {
  const uid = assertAuthenticated(context);
  const { quizId, answers, mode, timeSpentSeconds, questionOrder, optionOrders } = data as {
    quizId: string;
    answers: number[][];
    mode: "practice" | "exam";
    timeSpentSeconds: number;
    questionOrder?: number[];
    optionOrders?: number[][];
  };

  if (!quizId || !Array.isArray(answers)) {
    throw new functions.https.HttpsError("invalid-argument", "quizId and answers array required");
  }

  const quizRef = db.ref(`quizzes/${quizId}`);
  const quizSnap = await quizRef.once("value");
  if (!quizSnap.exists()) {
    throw new functions.https.HttpsError("not-found", "Quiz not found");
  }

  const quizData = quizSnap.val() as PublicQuiz;
  if (!quizData.isPublished && mode === "exam") {
    throw new functions.https.HttpsError("permission-denied", "Quiz is not published for exams");
  }

  const answerKeyRef = db.ref(`answerKeys/${quizId}`);
  const answerKeySnap = await answerKeyRef.once("value");
  if (!answerKeySnap.exists()) {
    throw new functions.https.HttpsError("internal", "Answer key not found for this quiz");
  }

  const answerKey = answerKeySnap.val() as AnswerKey;
  const correctAnswers = answerKey.correctAnswers;

  if (answers.length !== correctAnswers.length) {
    throw new functions.https.HttpsError("invalid-argument", "Answer count mismatch");
  }

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const questionResults: QuestionResult[] = [];

  for (let i = 0; i < answers.length; i++) {
    const selectedIndexes = answers[i] || [];
    const correctIndexes = correctAnswers[i] || [];
    const isCorrect = selectedIndexes.length > 0 &&
      selectedIndexes.length === correctIndexes.length &&
      selectedIndexes.every((idx) => correctIndexes.includes(idx));

    if (selectedIndexes.length === 0) {
      unansweredCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      wrongCount++;
    }

    const originalQuestionIndex = questionOrder ? questionOrder[i] : i;
    const question = quizData.questions[originalQuestionIndex];
    const optionOrder = optionOrders && optionOrders[i] ? optionOrders[i] : null;

    let displaySelected = selectedIndexes;
    let displayCorrect = correctIndexes;

    if (optionOrder) {
      displaySelected = selectedIndexes.map((idx) => optionOrder[idx]).filter((v) => v !== undefined);
      displayCorrect = correctIndexes.map((idx) => optionOrder[idx]).filter((v) => v !== undefined);
    }

    questionResults.push({
      questionIndex: originalQuestionIndex,
      questionText: question.text,
      selectedIndexes: displaySelected,
      correctIndexes: displayCorrect,
      isCorrect,
      explanation: question.explanation,
    });
  }

  const totalQuestions = correctAnswers.length;
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const attemptRef = db.ref(`attempts/${uid}`).push();
  const attempt: UserAttempt = {
    userId: uid,
    quizId,
    quizTitle: quizData.title,
    mode,
    answers,
    score,
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    timeSpentSeconds: timeSpentSeconds || 0,
    startedAt: new Date(Date.now() - (timeSpentSeconds || 0) * 1000).toISOString(),
    completedAt: new Date().toISOString(),
    questionResults,
  };

  await attemptRef.set(attempt);

  return {
    attemptId: attemptRef.key,
    score,
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    questionResults,
  };
});

export const createQuiz = functions.https.onCall(async (data, context) => {
  assertAdmin(context);
  const uid = context!.auth!.uid;

  const { title, rawContent, tags, isPublished } = data as {
    title: string;
    rawContent: string;
    tags?: string[];
    isPublished?: boolean;
  };

  if (!title || !rawContent) {
    throw new functions.https.HttpsError("invalid-argument", "Title and rawContent required");
  }

  const { parsed, errors } = parseRaw(rawContent);
  if (!parsed.length) {
    throw new functions.https.HttpsError("invalid-argument", "No valid questions parsed: " + errors.join("; "));
  }

  const quizRef = db.ref("quizzes").push();
  const quizId = quizRef.key!;

  const questions = parsed.map((q) => ({
    text: q.text,
    options: q.options.map((opt) => ({ letter: opt.letter, text: opt.text })),
    correctIndexes: q.options
      .map((opt, idx) => (opt.correct ? idx : -1))
      .filter((idx) => idx !== -1),
    explanation: q.explanation,
    tags: q.tags,
    difficulty: q.difficulty,
  }));

  const quiz: PublicQuiz = {
    title,
    questions,
    questionCount: questions.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: uid,
    tags: tags || [],
    isPublished: isPublished || false,
  };

  const answerKey: AnswerKey = {
    quizId,
    correctAnswers: questions.map((q) => q.correctIndexes),
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    quizRef.set(quiz),
    db.ref(`answerKeys/${quizId}`).set(answerKey),
  ]);

  return { quizId, questionCount: questions.length, errors };
});

export const updateQuiz = functions.https.onCall(async (data, context) => {
  assertAdmin(context);
  const { quizId, title, rawContent, tags, isPublished } = data as {
    quizId: string;
    title?: string;
    rawContent?: string;
    tags?: string[];
    isPublished?: boolean;
  };

  if (!quizId) {
    throw new functions.https.HttpsError("invalid-argument", "quizId required");
  }

  const quizRef = db.ref(`quizzes/${quizId}`);
  const quizSnap = await quizRef.once("value");
  if (!quizSnap.exists()) {
    throw new functions.https.HttpsError("not-found", "Quiz not found");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  let newQuestions: ParsedQuestion[] | null = null;

  if (title) updates.title = title;
  if (tags) updates.tags = tags;
  if (isPublished !== undefined) updates.isPublished = isPublished;

  if (rawContent) {
    const { parsed, errors } = parseRaw(rawContent);
    if (!parsed.length) {
      throw new functions.https.HttpsError("invalid-argument", "No valid questions parsed: " + errors.join("; "));
    }
    newQuestions = parsed.map((q) => ({
      text: q.text,
      options: q.options.map((opt) => ({ letter: opt.letter, text: opt.text })),
      correctIndexes: q.options
        .map((opt, idx) => (opt.correct ? idx : -1))
        .filter((idx) => idx !== -1),
      explanation: q.explanation,
      tags: q.tags,
      difficulty: q.difficulty,
    }));
    updates.questions = newQuestions;
    updates.questionCount = newQuestions.length;
  }

  await quizRef.update(updates);

  if (newQuestions) {
    const answerKey: AnswerKey = {
      quizId,
      correctAnswers: newQuestions.map((q) => q.correctIndexes),
      createdAt: new Date().toISOString(),
    };
    await db.ref(`answerKeys/${quizId}`).set(answerKey);
  }

  return { success: true };
});

export const deleteQuiz = functions.https.onCall(async (data, context) => {
  assertAdmin(context);
  const { quizId } = data as { quizId: string };

  if (!quizId) {
    throw new functions.https.HttpsError("invalid-argument", "quizId required");
  }

  await Promise.all([
    db.ref(`quizzes/${quizId}`).remove(),
    db.ref(`answerKeys/${quizId}`).remove(),
  ]);

  return { success: true };
});

export const getQuizzes = functions.https.onCall(async (data, context) => {
  const uid = assertAuthenticated(context);
  const { tags, difficulty, publishedOnly } = data as {
    tags?: string[];
    difficulty?: "easy" | "medium" | "hard";
    publishedOnly?: boolean;
  };

  const snapshot = await db.ref("quizzes").once("value");
  if (!snapshot.exists()) return { quizzes: [] };

  let quizzes: Array<{ id: string; data: PublicQuiz }> = [];
  snapshot.forEach((child) => {
    const quiz = child.val() as PublicQuiz;
    if (publishedOnly && !quiz.isPublished) return;
    if (tags && tags.length > 0 && (!quiz.tags || !tags.some((t) => quiz.tags!.includes(t)))) return;
    if (difficulty && quiz.questions.some((q) => q.difficulty !== difficulty)) return;
    quizzes.push({ id: child.key!, data: quiz });
  });

  quizzes.sort((a, b) => (b.data.updatedAt || "").localeCompare(a.data.updatedAt || ""));

  return { quizzes: quizzes.map(({ id, data }) => ({ id, ...data })) };
});

export const getQuizForAttempt = functions.https.onCall(async (data, context) => {
  const uid = assertAuthenticated(context);
  const { quizId, mode } = data as { quizId: string; mode: "practice" | "exam" };

  const quizRef = db.ref(`quizzes/${quizId}`);
  const quizSnap = await quizRef.once("value");
  if (!quizSnap.exists()) {
    throw new functions.https.HttpsError("not-found", "Quiz not found");
  }

  const quiz = quizSnap.val() as PublicQuiz;
  if (!quiz.isPublished && mode === "exam") {
    throw new functions.https.HttpsError("permission-denied", "Quiz not published for exam mode");
  }

  let questions = [...quiz.questions];
  const questionOrder = questions.map((_, i) => i);
  const optionOrders = questions.map((q) => q.options.map((_, i) => i));

  if (mode === "exam") {
    const shuffledQuestions = shuffleArray(questions.map((q, i) => ({ q, originalIndex: i })));
    questions = shuffledQuestions.map((sq) => sq.q);
    const newQuestionOrder = shuffledQuestions.map((sq) => sq.originalIndex);

    questions = questions.map((q) => {
      const shuffledOptions = shuffleArray(q.options.map((opt, i) => ({ opt, originalIndex: i })));
      return {
        ...q,
        options: shuffledOptions.map((so) => so.opt),
      };
    });

    const newOptionOrders = shuffledQuestions.map((sq) => {
      const originalQuestion = quiz.questions[sq.originalIndex];
      const shuffledOptions = shuffleArray(originalQuestion.options.map((opt, i) => ({ opt, originalIndex: i })));
      return shuffledOptions.map((so) => so.originalIndex);
    });

    return {
      quiz: { ...quiz, questions },
      questionOrder: newQuestionOrder,
      optionOrders: newOptionOrders,
    };
  }

  return { quiz: { ...quiz, questions }, questionOrder, optionOrders };
});

export const getUserAttempts = functions.https.onCall(async (data, context) => {
  const uid = assertAuthenticated(context);
  const { quizId, limit: limitCount } = data as { quizId?: string; limit?: number };

  let ref = db.ref(`attempts/${uid}`).orderByChild("completedAt");
  if (limitCount) ref = ref.limitToLast(limitCount);

  const snapshot = await ref.once("value");
  if (!snapshot.exists()) return { attempts: [] };

  const attempts: UserAttempt[] = [];
  snapshot.forEach((child) => {
    const attempt = child.val() as UserAttempt;
    if (quizId && attempt.quizId !== quizId) return;
    attempts.push({ ...attempt, id: child.key! });
  });

  attempts.reverse();
  return { attempts };
});

export const getUserStats = functions.https.onCall(async (data, context) => {
  const uid = assertAuthenticated(context);

  const attemptsSnap = await db.ref(`attempts/${uid}`).once("value");
  if (!attemptsSnap.exists()) {
    return {
      totalAttempts: 0,
      totalQuestions: 0,
      averageScore: 0,
      bestScore: 0,
      practiceAttempts: 0,
      examAttempts: 0,
      byTag: {} as Record<string, { attempts: number; avgScore: number }>,
      byDifficulty: {} as Record<string, { attempts: number; avgScore: number }>,
      recentActivity: [] as { date: string; score: number; quizTitle: string }[],
    };
  }

  const attempts: UserAttempt[] = [];
  attemptsSnap.forEach((child) => {
    attempts.push(child.val() as UserAttempt);
  });

  const totalAttempts = attempts.length;
  const totalQuestions = attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
  const averageScore = totalAttempts > 0 ? attempts.reduce((sum, a) => sum + a.score, 0) / totalAttempts : 0;
  const bestScore = attempts.length > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;
  const practiceAttempts = attempts.filter((a) => a.mode === "practice").length;
  const examAttempts = attempts.filter((a) => a.mode === "exam").length;

  const byTag: Record<string, { attempts: number; totalScore: number }> = {};
  const byDifficulty: Record<string, { attempts: number; totalScore: number }> = {};

  for (const attempt of attempts) {
    const quizSnap = await db.ref(`quizzes/${attempt.quizId}`).once("value");
    if (!quizSnap.exists()) continue;
    const quiz = quizSnap.val() as PublicQuiz;

    if (quiz.tags) {
      for (const tag of quiz.tags) {
        if (!byTag[tag]) byTag[tag] = { attempts: 0, totalScore: 0 };
        byTag[tag].attempts++;
        byTag[tag].totalScore += attempt.score;
      }
    }

    for (const q of quiz.questions) {
      if (q.difficulty) {
        if (!byDifficulty[q.difficulty]) byDifficulty[q.difficulty] = { attempts: 0, totalScore: 0 };
        byDifficulty[q.difficulty].attempts++;
        byDifficulty[q.difficulty].totalScore += attempt.score;
      }
    }
  }

  const tagStats: Record<string, { attempts: number; avgScore: number }> = {};
  for (const [tag, data] of Object.entries(byTag)) {
    tagStats[tag] = { attempts: data.attempts, avgScore: data.totalScore / data.attempts };
  }

  const difficultyStats: Record<string, { attempts: number; avgScore: number }> = {};
  for (const [diff, data] of Object.entries(byDifficulty)) {
    difficultyStats[diff] = { attempts: data.attempts, avgScore: data.totalScore / data.attempts };
  }

  const recentActivity = attempts
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, 10)
    .map((a) => ({ date: a.completedAt, score: a.score, quizTitle: a.quizTitle }));

  return {
    totalAttempts,
    totalQuestions,
    averageScore: Math.round(averageScore * 10) / 10,
    bestScore,
    practiceAttempts,
    examAttempts,
    byTag: tagStats,
    byDifficulty: difficultyStats,
    recentActivity,
  };
});

export const setUserRole = functions.https.onCall(async (data, context) => {
  assertAdmin(context);
  const { targetUid, role } = data as { targetUid: string; role: "admin" | "student" };

  if (!["admin", "student"].includes(role)) {
    throw new functions.https.HttpsError("invalid-argument", "Role must be admin or student");
  }

  await admin.auth().setCustomUserClaims(targetUid, { role });
  await db.ref(`users/${targetUid}/role`).set(role);

  return { success: true };
});

export const onUserCreate = functions.auth.user().onCreate(async (user) => {
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || "",
    displayName: user.displayName || undefined,
    role: "student",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  };
  await db.ref(`users/${user.uid}`).set(profile);
});

function parseRaw(raw: string): { parsed: ParsedQuestion[]; errors: string[] } {
  const lines = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const blocks: Array<{ text: string; lineNumber: number }[]> = [];
  let current: Array<{ text: string; lineNumber: number }> | null = null;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const isHeader = /^câu\s*\d+\s*[:.)-]/i.test(trimmed) ||
      /^question\s*\d+\s*[:.)-]/i.test(trimmed) ||
      /^\d+\s*[-:.)]/.test(trimmed);

    if (isHeader) {
      if (current) blocks.push(current);
      current = [{ text: trimmed, lineNumber: index + 1 }];
    } else if (current) {
      current.push({ text: trimmed, lineNumber: index + 1 });
    }
  });

  if (current) blocks.push(current);

  const parsed: ParsedQuestion[] = [];
  const errors: string[] = [];

  for (const block of blocks) {
    let questionText = block[0].text
      .replace(/^câu\s*\d+\s*[:.)-]\s*/i, "")
      .replace(/^question\s*\d+\s*[:.)-]\s*/i, "")
      .replace(/^\d+\s*[-:.)]\s*/, "")
      .replace(/\*+\s*$/, "")
      .trim();

    if (!questionText) {
      errors.push(`Line ${block[0].lineNumber}: missing question text`);
      continue;
    }

    const options: Array<{ letter: string; text: string; correct: boolean }> = [];
    let explanation: string | undefined;

    for (const rawLine of block.slice(1)) {
      const lineText = rawLine.text;
      const expMatch = lineText.match(/^explanation\s*[:：]\s*(.+)$/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
        continue;
      }

      const tagMatch = lineText.match(/^tags?\s*[:：]\s*(.+)$/i);
      if (tagMatch) {
        continue;
      }

      const diffMatch = lineText.match(/^difficulty\s*[:：]\s*(easy|medium|hard)$/i);
      if (diffMatch) {
        continue;
      }

      let match = lineText.match(/^(\*)?\s*\[([a-dA-D])\]\s*(?:--\s*)?(.+)$/);
      if (match) {
        options.push({
          correct: Boolean(match[1]),
          letter: match[2].toUpperCase(),
          text: match[3].trim(),
        });
        continue;
      }

      match = lineText.match(/^(\*)?\s*([a-dA-D])\s*[.)-]\s*(?:--\s*)?(.+)$/);
      if (match) {
        options.push({
          correct: Boolean(match[1]),
          letter: match[2].toUpperCase(),
          text: match[3].trim(),
        });
        continue;
      }

      if (options.length > 0) {
        options[options.length - 1].text += " " + lineText.trim();
      }
    }

    const correctCount = options.filter((o) => o.correct).length;
    if (options.length < 2 || correctCount < 1) {
      errors.push(`Line ${block[0].lineNumber}: need at least 2 options and 1 correct answer (*)`);
      continue;
    }

    parsed.push({
      text: questionText,
      options: options.map((o) => ({ letter: o.letter, text: o.text })),
      correctIndexes: options.map((o, i) => (o.correct ? i : -1)).filter((i) => i !== -1),
      explanation,
    });
  }

  return { parsed, errors };
}