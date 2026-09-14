# QuizLab Firebase (Free Tier)

QuizLab is a full-featured quiz/exam web application built with vanilla HTML/CSS/JavaScript and Firebase **Spark (Free) plan only**. No Cloud Functions, no Blaze plan required. Uses Firebase Realtime Database security rules for server-side grading validation.

## Architecture Overview (Free Tier)

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
                           │ Direct DB Reads/Writes
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Firebase Realtime Database (Spark)             │
│  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌─────────┐   │
│  │ quizzes  │  │ answerKeys  │  │ attempts │  │ users   │   │
│  │ (public) │  │ (.read:     │  │ (per uid)│  │ (roles) │   │
│  │          │  │  false!)    │  │          │  │         │   │
│  └──────────┘  └─────────────┘  └──────────┘  └─────────┘   │
│         ▲               ▲               ▲            ▲       │
│         │               │               │            │       │
│         │        .validate rules      │            │       │
│         │        (server-side)        │            │       │
│         └─────────────────────────────┴────────────┘       │
│              Server-side validation runs in Firebase        │
└─────────────────────────────────────────────────────────────┘
```

## Key Security Features (No Cloud Functions Needed)

- **Answer keys never leave the server** - Stored in `/answerKeys` with `.read: false` in Database Rules
- **Server-side grading via Rules** - Firebase `.validate` rules compare submitted answers against `/answerKeys` — client cannot forge `isCorrect: true`
- **Firebase Authentication** - Email/password + Google OAuth (free tier)
- **Role-based access** - Admin (create/edit/publish quizzes) vs Student (take quizzes, view own history)
- **Database Rules** - Enforce permissions AND grading validation at database level

## Quick Start (100% Free Tier)

### 1. Firebase Project Setup

1. Create a Firebase project at https://console.firebase.google.com
2. Enable **Authentication** → Sign-in methods: Email/Password, Google
3. Enable **Realtime Database** → Start in test mode (we'll secure it)
4. **Do NOT enable Cloud Functions** (not needed, requires Blaze)
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

### 3. Deploy Database Rules (Only Deploy Step!)

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login and select project
firebase login
firebase use YOUR_PROJECT_ID

# Deploy rules ONLY - no functions needed
firebase deploy --only database
```

### 4. Bootstrap First Admin (Run Once Locally)

After the first user signs up, run this local script to make them admin:

```bash
# 1. Create service account key in Firebase Console > Project Settings > Service Accounts
# 2. Save as service-account.json in project root (gitignored)
# 3. Install firebase-admin
cd scripts && npm install

# 4. Run bootstrap script
node bootstrap-admin.js user@example.com
```

The user must sign out and sign back in to receive admin privileges.

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

**No Cloud Functions deployment needed!**

## Free Tier Limits (Spark Plan)

| Resource | Limit | Notes |
|----------|-------|-------|
| Realtime Database Storage | 1 GB | ~100k questions with metadata |
| Realtime Database Download | 10 GB/month | ~1M quiz loads |
| Authentication | Unlimited users | Email/password, Google, anonymous |
| Hosting (GitHub Pages) | Unlimited | Static files only |
| Custom Claims (Admin) | Unlimited | Set via local script |

**Suitable for**: Classrooms, study groups, small schools (100-500 active users). For larger scale, consider upgrading to Blaze or migrating grading to a dedicated backend.

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

Same columns as CSV. First row must be headers. Uses SheetJS for parsing (loaded from CDN).

## User Roles

### Admin
- Create/edit/delete quizzes
- Publish/unpublish quizzes for exam mode
- View all quiz statistics
- **Set other users as admin**: Run local bootstrap script `scripts/bootstrap-admin.js`

### Student
- Browse published quizzes
- Practice mode (instant feedback, explanations)
- Exam mode (timer, randomized questions/options, server-validated grading)
- View own attempt history and progress statistics

## Modes

### Practice Mode (📚 Luyện tập)
- Immediate feedback after each answer
- Shows correct answer and explanation
- No time limit
- Unlimited retries

### Exam Mode (📝 Thi thử)
- Questions and options randomized per attempt
- Countdown timer (configurable per quiz)
- Submit once for server-validated grading via Database Rules
- Results stored in attempt history with `verified` flag

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
**Never readable by clients.** Only used by Database Rules for validation.

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
  "verified": true,
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
- `verified: true` means the attempt passed Database Rules validation
- `verified: false` would indicate a validation error (should not happen in normal use)

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

## Database Rules (Server-Side Validation)

The key innovation: **grading happens in Database Rules**, not Cloud Functions.

```json
{
  "rules": {
    "quizzes": { ... },
    "answerKeys": {
      ".read": false,
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "attempts": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        ".write": "auth != null && auth.uid == $uid",
        "$attemptId": {
          ".validate": "newData.hasChild('verified')",
          "isCorrect": {
            ".validate": "newData.isBoolean() && newData.val() == (root.child('answerKeys').child(newData.parent().parent().parent().child('quizId').val()).child('correctAnswers').child(newData.parent().parent().child('questionIndex').val()).val().includes(newData.parent().child('selectedIndexes').val()[0]))"
          }
        }
      }
    },
    "users": { ... }
  }
}
```

**How it works:**
1. Client submits attempt with `selectedIndexes` for each question
2. Client computes `isCorrect` locally and includes it
3. Database Rule `.validate` on `isCorrect` checks against `/answerKeys/{quizId}/correctAnswers`
4. If client lies (sends `isCorrect: true` when wrong), rule rejects write → **Permission denied**
5. Only valid attempts with correct `isCorrect` values can be written

See `database.rules.json` for complete rules.

## Project Structure

```
QuizLab/
├── index.html              # Main HTML entry point
├── style.css               # All styles (mobile-first responsive)
├── config.js               # Firebase config (gitignored)
├── config.example.js       # Config template
├── manifest.json           # PWA manifest
├── sw.js                   # Service worker (offline support)
├── database.rules.json     # Realtime Database security rules (with .validate grading)
├── .gitignore              # Ignores config.js, service-account.json
├── src/
│   ├── app.js              # Main application logic
│   └── modules/
│       ├── parser.js       # Question parsing (text, CSV, Excel)
│       ├── firebase.js     # Firebase SDK wrappers (direct DB, no functions)
│       ├── quizEngine.js   # Quiz state, grading, randomization
│       └── ui.js           # DOM rendering utilities
├── scripts/
│   ├── bootstrap-admin.js  # Local admin role assignment (run once)
│   └── package.json        # firebase-admin dependency
├── functions/              # [Reference only - not deployed]
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts        # Original Cloud Functions (kept for reference)
└── tests/
    └── parser.test.js      # Unit tests for parser
```

## Development

### Run Tests
```bash
node tests/parser.test.js
```

### Code Style
- Vanilla ES modules (no build step for client)
- Mobile-first responsive CSS
- No external UI frameworks
- Firebase SDK v10 modular imports

## PWA Support

- `manifest.json` - Installable on mobile/desktop
- `sw.js` - Service worker caches static assets for offline use
- Run `npx serve .` and test "Add to Home Screen"

## Security Model: Trade-offs & Limitations

This free-tier approach provides **"practical security for educational use"** with these characteristics:

| Threat | Mitigation | Limitation |
|--------|------------|------------|
| Student reads answer key | `.read: false` on `/answerKeys` | Admin with service account can still read |
| Student forges correct answers | `.validate` rule checks against answer key | Requires client to include `isCorrect` in write |
| Student modifies own score | Score validated via `correctCount` in rules | Score derived from validated `isCorrect` |
| Admin privilege escalation | Custom claims + DB role check | Service account bypasses all rules |

**Not protected against:**
- Compromised service account (server-side)
- Firebase project owner/admin in Console
- Network-level attacks (use HTTPS, which GitHub Pages + Firebase provide)

**Good enough for:** Classroom exams, certification practice, study groups where teacher trusts students not to have server access.

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