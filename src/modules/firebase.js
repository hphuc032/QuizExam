import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { getDatabase, ref, push, set, get, child, remove, update, query, orderByChild, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = window.QUIZLAB_FIREBASE_CONFIG || {};
const requiredFirebaseKeys = ["apiKey", "authDomain", "databaseURL", "projectId", "appId"];
const firebaseReady = requiredFirebaseKeys.every(key => {
  const value = firebaseConfig[key];
  return value && !String(value).includes("YOUR_");
});

let app = null;
let auth = null;
let db = null;

if (firebaseReady) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getDatabase(app);
}

export function isFirebaseReady() {
  return firebaseReady;
}

export function getAuthInstance() {
  return auth;
}

export function getDatabaseInstance() {
  return db;
}

export async function signUp(email, password) {
  if (!auth) throw new Error("Firebase not initialized");
  const result = await createUserWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signIn(email, password) {
  if (!auth) throw new Error("Firebase not initialized");
  const result = await signInWithEmailAndPassword(auth, email, password);
  return result.user;
}

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase not initialized");
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  return result.user;
}

export async function signOutUser() {
  if (!auth) throw new Error("Firebase not initialized");
  await signOut(auth);
}

export function onAuthStateChange(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
}

export async function syncUserProfile(user) {
  if (!db || !user) return;
  try {
    const userRef = ref(db, `users/${user.uid}`);
    const snap = await get(userRef);
    const tokenResult = await user.getIdTokenResult().catch(() => null);
    const tokenRole = tokenResult?.claims?.role;

    if (!snap.exists()) {
      const role = (tokenRole === "admin" || user.email === "nhpntd@gmail.com") ? "admin" : "student";
      const profile = {
        uid: user.uid,
        email: user.email,
        role,
        displayName: user.displayName || user.email.split("@")[0],
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString()
      };
      await set(userRef, profile);
    } else {
      const existing = snap.val();
      const updates = { lastLoginAt: new Date().toISOString() };
      if ((tokenRole === "admin" || user.email === "nhpntd@gmail.com") && existing.role !== "admin") {
        updates.role = "admin";
      }
      await update(userRef, updates);
    }
  } catch (err) {
    console.warn("Could not sync user profile to DB:", err);
  }
}

export async function getCurrentUserRole() {
  if (!auth || !auth.currentUser) return null;
  try {
    const tokenResult = await auth.currentUser.getIdTokenResult();
    if (tokenResult.claims?.role === "admin") return "admin";
    if (auth.currentUser.email === "nhpntd@gmail.com") return "admin";

    if (db) {
      const snap = await get(ref(db, `users/${auth.currentUser.uid}/role`));
      if (snap.exists() && snap.val() === "admin") return "admin";
    }
    return "student";
  } catch {
    return auth.currentUser.email === "nhpntd@gmail.com" ? "admin" : "student";
  }
}

export async function createQuizDirect(data) {
  if (!db) throw new Error("Database not initialized");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  const { title, rawContent, tags, isPublished } = data;
  const { parseRaw } = await import("./parser.js");
  const { questions: parsed, errors } = parseRaw(rawContent);
  if (!parsed.length) {
    throw new Error("No valid questions parsed: " + errors.join("; "));
  }

  const questions = parsed.map(q => ({
    text: q.text,
    options: q.options.map(opt => ({ letter: opt.letter, text: opt.text })),
    correctIndexes: q.correctIndexes,
    explanation: q.explanation,
    tags: q.tags,
    difficulty: q.difficulty
  }));

  const newRef = push(ref(db, "quizzes"));
  const quizId = newRef.key;

  const quizData = {
    title,
    questions,
    questionCount: questions.length,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: auth.currentUser.uid,
    tags: tags || [],
    isPublished: Boolean(isPublished)
  };

  const answerKeyData = {
    quizId,
    correctAnswers: questions.map(q => q.correctIndexes),
    createdAt: new Date().toISOString()
  };

  await Promise.all([
    set(newRef, quizData),
    set(ref(db, `answerKeys/${quizId}`), answerKeyData)
  ]);

  return { quizId, questionCount: questions.length, errors };
}

export async function updateQuizDirect(data) {
  if (!db) throw new Error("Database not initialized");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  const { quizId, title, rawContent, tags, isPublished } = data;
  const quizRef = ref(db, `quizzes/${quizId}`);
  const snapshot = await get(quizRef);
  if (!snapshot.exists()) throw new Error("Quiz not found");
  const existing = snapshot.val();

  const updates = { updatedAt: new Date().toISOString() };
  let newQuestions = null;

  if (title !== undefined) updates.title = title;
  if (tags !== undefined) updates.tags = tags;
  if (isPublished !== undefined) updates.isPublished = Boolean(isPublished);
  if (!existing.createdBy) updates.createdBy = auth.currentUser.uid;

  if (rawContent) {
    const { parseRaw } = await import("./parser.js");
    const { questions: parsed, errors } = parseRaw(rawContent);
    if (!parsed.length) throw new Error("No valid questions parsed: " + errors.join("; "));

    newQuestions = parsed.map(q => ({
      text: q.text,
      options: q.options.map(opt => ({ letter: opt.letter, text: opt.text })),
      correctIndexes: q.correctIndexes,
      explanation: q.explanation,
      tags: q.tags,
      difficulty: q.difficulty
    }));
    updates.questions = newQuestions;
    updates.questionCount = newQuestions.length;
  }

  await update(quizRef, updates);

  if (newQuestions) {
    const answerKeyData = {
      quizId,
      correctAnswers: newQuestions.map(q => q.correctIndexes),
      createdAt: new Date().toISOString()
    };
    await set(ref(db, `answerKeys/${quizId}`), answerKeyData).catch(() => {});
  }

  return { success: true };
}

export async function toggleQuizPublishDirect(quizId, currentPublished) {
  if (!db) throw new Error("Database not initialized");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  const newStatus = !currentPublished;
  await update(ref(db, `quizzes/${quizId}`), {
    isPublished: newStatus,
    updatedAt: new Date().toISOString()
  });
  return newStatus;
}

export async function deleteQuizDirect(quizId) {
  if (!db) throw new Error("Database not initialized");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  await Promise.all([
    remove(ref(db, `quizzes/${quizId}`)),
    remove(ref(db, `answerKeys/${quizId}`)).catch(() => {})
  ]);
  return { success: true };
}

export async function getQuizzesDirect(filters = {}) {
  if (!db) throw new Error("Database not initialized");

  const snapshot = await get(child(ref(db), "quizzes"));
  if (!snapshot.exists()) return { quizzes: [] };

  let quizzes = [];
  snapshot.forEach(child => {
    const quiz = child.val();
    if (filters.publishedOnly && !quiz.isPublished) return;
    if (filters.tags && filters.tags.length > 0 && (!quiz.tags || !filters.tags.some(t => quiz.tags.includes(t)))) return;
    if (filters.difficulty && quiz.questions.some(q => q.difficulty !== filters.difficulty)) return;
    quizzes.push({ id: child.key, ...quiz });
  });

  quizzes.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  return { quizzes };
}

export async function getQuizForAttemptDirect(quizId, mode) {
  if (!db) throw new Error("Database not initialized");

  const snapshot = await get(child(ref(db), `quizzes/${quizId}`));
  if (!snapshot.exists()) throw new Error("Quiz not found");

  const quiz = snapshot.val();
  if (!quiz.isPublished && mode === "exam") throw new Error("Quiz not published for exam mode");

  let questions = [...quiz.questions];
  const questionOrder = questions.map((_, i) => i);
  const optionOrders = questions.map(q => q.options.map((_, i) => i));

  if (mode === "exam") {
    const shuffledQuestions = shuffleArray(questions.map((q, i) => ({ q, originalIndex: i })));
    questions = shuffledQuestions.map(sq => sq.q);
    const newQuestionOrder = shuffledQuestions.map(sq => sq.originalIndex);

    questions = questions.map(q => {
      const shuffledOptions = shuffleArray(q.options.map((opt, i) => ({ opt, originalIndex: i })));
      return { ...q, options: shuffledOptions.map(so => so.opt) };
    });

    const newOptionOrders = shuffledQuestions.map(sq => {
      const originalQuestion = quiz.questions[sq.originalIndex];
      const shuffledOptions = shuffleArray(originalQuestion.options.map((opt, i) => ({ opt, originalIndex: i })));
      return shuffledOptions.map(so => so.originalIndex);
    });

    return { quiz: { ...quiz, questions }, questionOrder: newQuestionOrder, optionOrders: newOptionOrders };
  }

  return { quiz: { ...quiz, questions }, questionOrder, optionOrders };
}

export async function submitQuizDirect(data) {
  if (!db) throw new Error("Database not initialized");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  const { quizId, answers, mode, timeSpentSeconds, questionOrder, optionOrders } = data;
  const uid = auth.currentUser.uid;

  const quizSnap = await get(child(ref(db), `quizzes/${quizId}`));
  if (!quizSnap.exists()) throw new Error("Quiz not found");
  const quiz = quizSnap.val();

  let correctAnswers = null;
  try {
    const answerKeySnap = await get(child(ref(db), `answerKeys/${quizId}`));
    if (answerKeySnap.exists()) {
      correctAnswers = answerKeySnap.val().correctAnswers;
    }
  } catch (err) {
    // Expected when answerKeys has .read: false for client SDK
  }

  if (!correctAnswers && quiz.questions) {
    correctAnswers = quiz.questions.map(q => q.correctIndexes || []);
  }

  if (!correctAnswers || !correctAnswers.length || correctAnswers.every(ans => !ans || !ans.length)) {
    throw new Error("Answer key not found (Đề chưa có answer key)");
  }

  if (answers.length !== correctAnswers.length) throw new Error("Answer count mismatch");

  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;
  const questionResults = [];

  for (let i = 0; i < answers.length; i++) {
    const selectedIndexes = answers[i] || [];
    const correctIndexes = correctAnswers[i] || [];
    const isCorrect = selectedIndexes.length > 0 &&
      selectedIndexes.length === correctIndexes.length &&
      selectedIndexes.every(idx => correctIndexes.includes(idx));

    if (selectedIndexes.length === 0) unansweredCount++;
    else if (isCorrect) correctCount++;
    else wrongCount++;

    const originalQuestionIndex = questionOrder ? questionOrder[i] : i;
    const question = quiz.questions[originalQuestionIndex];
    const optionOrder = optionOrders && optionOrders[i] ? optionOrders[i] : null;

    let displaySelected = selectedIndexes;
    let displayCorrect = correctIndexes;

    if (optionOrder) {
      displaySelected = selectedIndexes.map(idx => optionOrder[idx]).filter(v => v !== undefined);
      displayCorrect = correctIndexes.map(idx => optionOrder[idx]).filter(v => v !== undefined);
    }

    const qr = {
      questionIndex: originalQuestionIndex,
      questionText: question.text,
      correctIndexes: displayCorrect,
      isCorrect
    };
    if (displaySelected && displaySelected.length > 0) {
      qr.selectedIndexes = displaySelected;
    }
    if (question.explanation) {
      qr.explanation = question.explanation;
    }
    questionResults.push(qr);
  }

  const totalQuestions = correctAnswers.length;
  const score = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const attemptRef = push(ref(db, `attempts/${uid}`));
  const attempt = {
    userId: uid,
    quizId,
    quizTitle: quiz.title,
    mode,
    score,
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    timeSpentSeconds: timeSpentSeconds || 0,
    startedAt: new Date(Date.now() - (timeSpentSeconds || 0) * 1000).toISOString(),
    completedAt: new Date().toISOString(),
    questionResults,
    verified: false
  };

  const sanitizedAnswers = {};
  answers.forEach((ans, idx) => {
    if (ans && ans.length > 0) sanitizedAnswers[idx] = ans;
  });
  if (Object.keys(sanitizedAnswers).length > 0) {
    attempt.answers = sanitizedAnswers;
  }

  await set(attemptRef, attempt);

  return {
    attemptId: attemptRef.key,
    score,
    totalQuestions,
    correctCount,
    wrongCount,
    unansweredCount,
    questionResults
  };
}

export async function getUserAttemptsDirect(quizId, limit) {
  if (!db) throw new Error("Database not initialized");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  const uid = auth.currentUser.uid;
  let refQuery = query(ref(db, `attempts/${uid}`), orderByChild("completedAt"));
  if (limit) refQuery = query(refQuery, limitToLast(limit));

  const snapshot = await get(refQuery);
  if (!snapshot.exists()) return { attempts: [] };

  const attempts = [];
  snapshot.forEach(child => {
    const attempt = child.val();
    if (quizId && attempt.quizId !== quizId) return;
    attempts.push({ ...attempt, id: child.key });
  });

  attempts.reverse();
  return { attempts };
}

export async function getUserStatsDirect() {
  if (!db) throw new Error("Database not initialized");
  if (!auth?.currentUser) throw new Error("Not authenticated");

  const uid = auth.currentUser.uid;
  const snapshot = await get(child(ref(db), `attempts/${uid}`));
  if (!snapshot.exists()) {
    return {
      totalAttempts: 0, totalQuestions: 0, averageScore: 0, bestScore: 0,
      practiceAttempts: 0, examAttempts: 0, byTag: {}, byDifficulty: {},
      recentActivity: []
    };
  }

  const attempts = [];
  snapshot.forEach(child => attempts.push(child.val()));

  const totalAttempts = attempts.length;
  const totalQuestions = attempts.reduce((sum, a) => sum + a.totalQuestions, 0);
  const averageScore = totalAttempts > 0 ? attempts.reduce((sum, a) => sum + a.score, 0) / totalAttempts : 0;
  const bestScore = attempts.length > 0 ? Math.max(...attempts.map(a => a.score)) : 0;
  const practiceAttempts = attempts.filter(a => a.mode === "practice").length;
  const examAttempts = attempts.filter(a => a.mode === "exam").length;

  const byTag = {};
  const byDifficulty = {};

  for (const attempt of attempts) {
    const quizSnap = await get(child(ref(db), `quizzes/${attempt.quizId}`));
    if (!quizSnap.exists()) continue;
    const quiz = quizSnap.val();

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

  const tagStats = {};
  for (const [tag, data] of Object.entries(byTag)) tagStats[tag] = { attempts: data.attempts, avgScore: data.totalScore / data.attempts };
  const difficultyStats = {};
  for (const [diff, data] of Object.entries(byDifficulty)) difficultyStats[diff] = { attempts: data.attempts, avgScore: data.totalScore / data.attempts };

  const recentActivity = attempts
    .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
    .slice(0, 10)
    .map(a => ({ date: a.completedAt, score: a.score, quizTitle: a.quizTitle }));

  return {
    totalAttempts, totalQuestions, averageScore: Math.round(averageScore * 10) / 10,
    bestScore, practiceAttempts, examAttempts, byTag: tagStats,
    byDifficulty: difficultyStats, recentActivity
  };
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function saveQuizToFirebaseDirect(quizId, data) {
  if (!db) throw new Error("Database not initialized");
  if (quizId) {
    await update(ref(db, `quizzes/${quizId}`), { ...data, updatedAt: new Date().toISOString() });
    return quizId;
  } else {
    const newRef = push(ref(db, "quizzes"));
    await set(newRef, { ...data, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    return newRef.key;
  }
}

export async function loadSavedQuizzesDirect() {
  if (!db) throw new Error("Database not initialized");
  const snapshot = await get(child(ref(db), "quizzes"));
  if (!snapshot.exists()) return [];
  const items = [];
  snapshot.forEach(item => items.push({ id: item.key, ...item.val() }));
  items.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  return items;
}

export async function loadQuizFromFirebaseDirect(id) {
  if (!db) throw new Error("Database not initialized");
  const snapshot = await get(child(ref(db), `quizzes/${id}`));
  if (!snapshot.exists()) return null;
  return { id, ...snapshot.val() };
}

export async function deleteQuizDirectLegacy(id) {
  if (!db) throw new Error("Database not initialized");
  await remove(ref(db, `quizzes/${id}`));
}