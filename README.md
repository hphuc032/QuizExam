# QuizLab Firebase

QuizLab is a full-featured quiz/exam web application built with vanilla HTML/CSS/JavaScript and Firebase. It supports secure server-side grading, authentication, role-based access control, practice/exam modes, and progress tracking.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Client (Browser)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Parser    │  │ Quiz Engine │  │      UI Render      │  │
│  │  (modules)  │◄─┤  (state,    │◄─┤  (questions,        │  │
│  └─────────────┘  │  grading)   │  │   results, timer)   │  │
│                   └──────┬──────┘  └─────────────────────┘  │
│                          │                                   │
│                   ┌──────▼──────┐                            │
│                   │ Firebase JS │                            │
│                   │   SDK v10   │                            │
│                   └──────┬──────┘                            │
└──────────────────────────│───────────────────────────────────┘
                           │ HTTPS Callable Functions
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    Firebase Cloud Functions                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ submitQuiz   │  │ createQuiz   │  │ getQuizForAttempt│   │
│  │ (grading)    │  │ updateQuiz   │  │ (randomization)  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ getUserStats │  │ getAttempts  │  │ setUserRole      │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
└──────────────────────────│───────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Firebase Realtime Database                     │
│  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌─────────┐   │
│  │ quizzes  │  │ answerKeys  │  │ attempts │  │ users   │   │
│  │ (public) │  │ (private!)  │  │ (per uid)│  │ (roles) │   │
│  └──────────┘  └─────────────┘  └──────────┘  └─────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Key Security Features

- **Answer keys never leave the server** - Stored in `/answerKeys` with `.read: false` in Database Rules
- **Server-side grading** - `submitQuiz` Cloud Function compares answers against server-stored keys
- **Firebase Authentication** - Email/password + Google OAuth
- **Role-based access** - Admin (create/edit/publish quizzes) vs Student (take quizzes, view own history)
- **Database Rules** - Enforce permissions at database level

## Quick Start

### 1. Firebase Project Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Authentication** → Sign-in methods: Email/Password, Google
3. Enable **Realtime Database** → Start in test mode (we'll secure it)
4. Enable **Cloud Functions** (Blaze plan required for deployment)
5. Create a web app to get your Firebase config

### 2. Local Configuration

```bash
# Clone and enter directory
git clone <your-repo>
cd QuizLab

# Copy example config
cp config.example.js config.js
```

Edit `config.js` with your Firebase web app config:
```js
window.QUIZLAB_FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  databaseURL: "https://YOUR_PROJECT-default-rtdb.REGION.firebasedatabase.app",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 3. Deploy Database Rules

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and select project
firebase login
firebase use YOUR_PROJECT_ID

# Deploy rules
firebase deploy --only database
```

### 4. Deploy Cloud Functions

```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```

### 5. Run Locally

```bash
# Serve static files (any static server works)
npx serve .
# Or: python -m http.server 8000
# Then open http://localhost:8000
```

### 6. GitHub Pages Deployment

1. Add repository secret `QUIZEXAM_FIREBASE_CONFIG` with full `config.js` content
2. Push to `main` branch
3. GitHub Actions workflow deploys to Pages automatically

## Question Format

### Text Format (Paste into Editor)

```text
1 - Nội dung câu hỏi
a) Đáp án A
*b) Đáp án đúng
*c) Đáp án đúng khác nếu có
d) Đáp án D
explanation: Giải thích chi tiết tại sao b,c đúng
tags: chủ đề 1, chủ đề 2
difficulty: medium
```

Supported features:
- **Question header**: `1 - `, `Câu 1 - `, `Question 1 - `
- **Options**: `a) ...`, `*b) ...`, `[c] ...`, `*[d] ...`
- **Multi-line options**: Continuation lines append to previous option
- **Metadata**: `explanation: ...`, `tags: tag1, tag2`, `difficulty: easy|medium|hard`
- **Legacy**: `[a]--...` format still supported

### CSV Format (Import/Export)

| Question | Option A | Option B | Option C | Option D | Correct Answer(s) | Explanation | Tags | Difficulty |
|----------|----------|----------|----------|----------|-------------------|-------------|------|------------|
| What is 2+2? | 3 | 4 | 5 | 6 | B | Basic math | arithmetic;math | easy |
| Prime numbers? | 2 | 3 | 4 | 5 | A;B;D | 2,3,5 are primes | math | medium |

- Multiple correct answers separated by `;`
- Tags separated by `;`
- Quotes automatically handled for commas/quotes in text

### Excel Format

Same columns as CSV. First row must be headers. Uses SheetJS for parsing.

## User Roles

### Admin
- Create/edit/delete quizzes
- Publish/unpublish quizzes for exam mode
- Set other users as admin via Cloud Function `setUserRole`
- View all quiz statistics

### Student
- Browse published quizzes
- Practice mode (instant feedback, explanations)
- Exam mode (timer, randomized questions/options, final grading)
- View own attempt history and progress statistics

**To make a user admin:**
```bash
# After user signs up, run in Functions shell or admin panel:
firebase functions:shell
> setUserRole({targetUid: "USER_UID", role: "admin"})
```

## Modes

### Practice Mode (📚 Luyện tập)
- Immediate feedback after each answer
- Shows correct answer and explanation
- No time limit
- Unlimited retries

### Exam Mode (📝 Thi thử)
- Questions and options randomized per attempt
- Countdown timer (configurable per quiz)
- Submit once for server-side grading
- Results stored in attempt history

## Data Schema

### `/quizzes/{quizId}` (Public - readable by authenticated users)
```json
{
  "title": "CSDL Chương 1",
  "questions": [
    {
      "text": "Trường khóa chính là trường:",
      "options": [
        {"letter": "A", "text": "Single Key"},
        {"letter": "B", "text": "Unique Key"},
        {"letter": "C", "text": "First Key"},
        {"letter": "D", "text": "Primary Key"}
      ],
      "correctIndexes": [3],
      "explanation": "Khóa chính xác định duy nhất bản ghi",
      "tags": ["csdl", "sql"],
      "difficulty": "easy"
    }
  ],
  "questionCount": 1,
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z",
  "createdBy": "uid123",
  "tags": ["csdl"],
  "isPublished": true
}
```

### `/answerKeys/{quizId}` (Private - `.read: false`)
```json
{
  "quizId": "quizId123",
  "correctAnswers": [[3]],  // Array of correct option indexes per question
  "createdAt": "2026-01-15T10:30:00.000Z"
}
```

### `/attempts/{uid}/{attemptId}` (Owned by user)
```json
{
  "userId": "uid123",
  "quizId": "quizId123",
  "quizTitle": "CSDL Chương 1",
  "mode": "exam",
  "answers": [[3]],  // Student's selected indexes
  "score": 100,
  "totalQuestions": 1,
  "correctCount": 1,
  "wrongCount": 0,
  "unansweredCount": 0,
  "timeSpentSeconds": 45,
  "startedAt": "2026-01-15T10:35:00.000Z",
  "completedAt": "2026-01-15T10:35:45.000Z",
  "questionResults": [
    {
      "questionIndex": 0,
      "questionText": "Trường khóa chính là trường:",
      "selectedIndexes": [3],
      "correctIndexes": [3],
      "isCorrect": true,
      "explanation": "Khóa chính xác định duy nhất bản ghi"
    }
  ]
}
```

### `/users/{uid}` (Owned by user)
```json
{
  "uid": "uid123",
  "email": "student@example.com",
  "displayName": "Nguyễn Văn A",
  "role": "student",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "lastLoginAt": "2026-01-15T10:30:00.000Z"
}
```

## Database Rules

```json
{
  "rules": {
    "quizzes": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "answerKeys": {
      ".read": false,
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "attempts": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid === $uid",
        ".write": "auth != null && auth.uid === $uid"
      }
    }
  }
}
```

## Project Structure

```
QuizLab/
├── index.html              # Main HTML entry point
├── style.css               # All styles (mobile-first responsive)
├── config.js               # Firebase config (gitignored)
├── config.example.js       # Config template
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline support)
├── database.rules.json     # Realtime Database security rules
├── src/
│   ├── app.js              # Main application logic
│   └── modules/
│       ├── parser.js       # Question parsing (text, CSV, Excel)
│       ├── firebase.js     # Firebase SDK wrappers & callable functions
│       ├── quizEngine.js   # Quiz state, grading, randomization
│       └── ui.js           # DOM rendering utilities
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── index.ts        # Cloud Functions (TypeScript)
└── tests/
    └── parser.test.js      # Unit tests for parser
```

## Development

### Run Tests
```bash
node tests/parser.test.js
```

### Local Functions Emulator
```bash
cd functions
npm run serve
# Functions available at http://localhost:5001/YOUR_PROJECT/us-central1
```

### Code Style
- Vanilla ES modules (no build step for client)
- TypeScript for Cloud Functions
- Mobile-first responsive CSS
- No external UI frameworks

## PWA Support

- `manifest.json` - Installable on mobile/desktop
- `sw.js` - Service worker caches static assets for offline use
- Run `npx serve .` and test "Add to Home Screen"

## Roadmap / Future Enhancements

- [ ] Share quiz via link/code
- [ ] Landing page with SEO
- [ ] AI-assisted question generation (hook ready in parser)
- [ ] Rich text editor for questions
- [ ] Question bank / pool for random selection
- [ ] Export results to PDF/Excel
- [ ] Classroom/group management

## License

MIT License - Feel free to use for educational purposes.

## Contributing

1. Fork the repo
2. Create feature branch
3. Run tests: `node tests/parser.test.js`
4. Submit PR with clear description