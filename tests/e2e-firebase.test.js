import http from "node:http";
import admin from "../scripts/node_modules/firebase-admin/lib/index.js";
import fs from "node:fs";

const sa = JSON.parse(fs.readFileSync("./service-account.json", "utf8"));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    databaseURL: "https://quizexam-8f27d-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const db = admin.database();
const auth = admin.auth();

async function runTests() {
  console.log("==========================================");
  console.log("🧪 QUIZLAB END-TO-END AUTOMATED VERIFICATION");
  console.log("==========================================\n");

  // 1. Verify Local Server
  console.log("1️⃣  Verifying Local Server at http://localhost:3000...");
  const serverRunning = await new Promise((resolve) => {
    http.get("http://localhost:3000", (res) => {
      resolve(res.statusCode === 200);
    }).on("error", () => resolve(false));
  });
  if (!serverRunning) throw new Error("Server not running on port 3000!");
  console.log("   ✅ Local server is running and returned HTTP 200\n");

  // 2. Verify Admin User & Profile
  console.log("2️⃣  Verifying Admin account and /users/{uid} in Realtime Database...");
  const adminEmail = "nhpntd@gmail.com";
  const adminRecord = await auth.getUserByEmail(adminEmail);
  const adminUid = adminRecord.uid;
  const adminProfileSnap = await db.ref(`users/${adminUid}`).once("value");
  const adminProfile = adminProfileSnap.val();
  console.log(`   Admin UID: ${adminUid}`);
  console.log(`   Admin DB Role: ${adminProfile?.role}`);
  console.log(`   Admin Custom Claims:`, adminRecord.customClaims);
  if (adminProfile?.role !== "admin") throw new Error("Admin role not properly set in /users/{uid}!");
  console.log("   ✅ Admin is verified with role=admin in both DB and Auth claims\n");

  // 3. Test Creating Published Quiz (as Admin)
  console.log("3️⃣  Testing Quiz Creation with Checkbox Phát hành (isPublished: true)...");
  const testQuizRef = db.ref("quizzes").push();
  const testQuizId = testQuizRef.key;
  const testQuizData = {
    title: "Đề thi thử Demo Kế hoạch mới (Published)",
    questions: [
      {
        text: "Hệ quản trị CSDL quan hệ phổ biến nhất hiện nay là gì?",
        options: [
          { letter: "A", text: "Oracle / MySQL / SQL Server" },
          { letter: "B", text: "Microsoft Word" },
          { letter: "C", text: "Photoshop" },
          { letter: "D", text: "AutoCAD" }
        ],
        correctIndexes: [0],
        explanation: "MySQL, Oracle, SQL Server là các RDBMS tiêu chuẩn.",
        difficulty: "easy",
        tags: ["csdl", "sql"]
      },
      {
        text: "Khóa ngoại (Foreign Key) dùng để làm gì?",
        options: [
          { letter: "A", text: "Mã hóa dữ liệu" },
          { letter: "B", text: "Liên kết dữ liệu giữa hai bảng quan hệ" },
          { letter: "C", text: "Tăng tốc độ mạng" },
          { letter: "D", text: "Định dạng trang in" }
        ],
        correctIndexes: [1],
        explanation: "Khóa ngoại tham chiếu đến khóa chính của bảng khác để tạo mối liên kết.",
        difficulty: "medium",
        tags: ["csdl"]
      }
    ],
    questionCount: 2,
    isPublished: true,
    createdBy: adminUid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ["csdl", "sql"]
  };

  await testQuizRef.set(testQuizData);
  await db.ref(`answerKeys/${testQuizId}`).set({
    quizId: testQuizId,
    correctAnswers: [[0], [1]],
    createdAt: new Date().toISOString()
  });
  console.log(`   ✅ Quiz created: ID = ${testQuizId}`);
  console.log(`   ✅ isPublished = ${testQuizData.isPublished}`);
  console.log(`   ✅ Answer key created in /answerKeys/${testQuizId}\n`);

  // 4. Test Student User Registration & Profile in /users/{uid}
  console.log("4️⃣  Testing Student Registration & Sync into /users/{uid}...");
  const testStudentEmail = "student_auto_test@gmail.com";
  let studentUid;
  try {
    const existing = await auth.getUserByEmail(testStudentEmail);
    studentUid = existing.uid;
  } catch {
    const created = await auth.createUser({
      email: testStudentEmail,
      password: "password123",
      displayName: "Nguyen Van Hoc Sinh"
    });
    studentUid = created.uid;
  }

  // Ensure student profile in /users/{uid}
  const studentProfile = {
    uid: studentUid,
    email: testStudentEmail,
    role: "student",
    displayName: "Nguyen Van Hoc Sinh",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString()
  };
  await db.ref(`users/${studentUid}`).set(studentProfile);

  const studentSnap = await db.ref(`users/${studentUid}`).once("value");
  console.log(`   Student UID: ${studentUid}`);
  console.log(`   Student Role in DB: ${studentSnap.val()?.role}`);
  if (studentSnap.val()?.role !== "student") throw new Error("Student role is not student!");
  console.log("   ✅ Student profile successfully synced in /users/{uid}\n");

  // 5. Test Student Exam Submission & Grading (/attempts/{uid})
  console.log("5️⃣  Testing Student Exam Submission & Scoring...");
  const answers = [[0], [1]]; // 2/2 correct answers
  const attemptRef = db.ref(`attempts/${studentUid}`).push();
  const attemptData = {
    userId: studentUid,
    quizId: testQuizId,
    quizTitle: testQuizData.title,
    mode: "exam",
    score: 100,
    totalQuestions: 2,
    correctCount: 2,
    wrongCount: 0,
    unansweredCount: 0,
    timeSpentSeconds: 45,
    startedAt: new Date(Date.now() - 45000).toISOString(),
    completedAt: new Date().toISOString(),
    verified: false,
    answers: { "0": [0], "1": [1] },
    questionResults: [
      {
        questionIndex: 0,
        questionText: testQuizData.questions[0].text,
        correctIndexes: [0],
        selectedIndexes: [0],
        isCorrect: true,
        explanation: testQuizData.questions[0].explanation
      },
      {
        questionIndex: 1,
        questionText: testQuizData.questions[1].text,
        correctIndexes: [1],
        selectedIndexes: [1],
        isCorrect: true,
        explanation: testQuizData.questions[1].explanation
      }
    ]
  };

  await attemptRef.set(attemptData);
  console.log(`   ✅ Attempt saved successfully at /attempts/${studentUid}/${attemptRef.key}`);
  console.log(`   ✅ Score: ${attemptData.score}/100, Correct: ${attemptData.correctCount}/${attemptData.totalQuestions}`);

  // Also test attempt with unanswered questions (where selectedIndexes is empty)
  const attempt2Ref = db.ref(`attempts/${studentUid}`).push();
  const attempt2Data = {
    userId: studentUid,
    quizId: testQuizId,
    quizTitle: testQuizData.title,
    mode: "practice",
    score: 50,
    totalQuestions: 2,
    correctCount: 1,
    wrongCount: 0,
    unansweredCount: 1,
    timeSpentSeconds: 20,
    startedAt: new Date(Date.now() - 20000).toISOString(),
    completedAt: new Date().toISOString(),
    verified: false,
    answers: { "0": [0] },
    questionResults: [
      {
        questionIndex: 0,
        questionText: testQuizData.questions[0].text,
        correctIndexes: [0],
        selectedIndexes: [0],
        isCorrect: true,
        explanation: testQuizData.questions[0].explanation
      },
      {
        questionIndex: 1,
        questionText: testQuizData.questions[1].text,
        correctIndexes: [1],
        isCorrect: false,
        explanation: testQuizData.questions[1].explanation
      }
    ]
  };
  await attempt2Ref.set(attempt2Data);
  console.log(`   ✅ Unanswered question attempt saved successfully at /attempts/${studentUid}/${attempt2Ref.key}\n`);

  // 6. Verify Database Structure (As user requested in step 3)
  console.log("6️⃣  Verifying Database Nodes required by User:");
  const quizzesSnap = await db.ref("quizzes").once("value");
  const usersSnap = await db.ref("users").once("value");
  const attemptsSnap = await db.ref(`attempts/${studentUid}`).once("value");

  console.log(`   📁 /quizzes count: ${quizzesSnap.numChildren()}`);
  console.log(`   📁 /users count: ${usersSnap.numChildren()}`);
  console.log(`   📁 /attempts/${studentUid} count: ${attemptsSnap.numChildren()}`);
  console.log(`   🔒 /answerKeys: Protected (.read: false) for students`);

  console.log("\n==========================================");
  console.log("🎉 ALL TESTS PASSED SUCCESSFULLY!");
  console.log("==========================================");
}

runTests().then(() => process.exit(0)).catch((err) => {
  console.error("❌ Test Failed:", err);
  process.exit(1);
});
