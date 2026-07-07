# QuizLab Firebase

QuizLab is a static HTML/CSS/JavaScript quiz builder that can save quiz drafts to Firebase Realtime Database.

## Use

Open `index.html` in a browser, paste a quiz, then click **Tạo đề**.

## Firebase config

The real Firebase config must live in `config.js`, which is intentionally ignored by Git.

1. Copy `config.example.js` to `config.js`.
2. Fill in your Firebase web app config.
3. Restrict the Firebase API key and Realtime Database rules in Firebase/Google Cloud.

Never commit `config.js` with a real API key.

For GitHub Pages, add a repository secret named `QUIZEXAM_FIREBASE_CONFIG` with the full `config.js` contents. The Pages workflow creates `config.js` only inside the deployment artifact.

Supported question format:

```text
1 - Nội dung câu hỏi
a) Đáp án A
*b) Đáp án đúng
*c) Đáp án đúng khác nếu có
d) Đáp án D
```

Use `*` before every correct option. Questions can have one or more correct answers. Single-answer questions show radio buttons; multi-answer questions show checkboxes. Older `[a]--...` lines are still supported for existing quizzes.

## Firebase safety checklist

The Firebase web config is public by design when used in a browser app. Security must come from Firebase Rules, Authentication, and API key restrictions, not from hiding the config.

Before using this with real users:

- Revoke or rotate any key that was previously committed to a public repository.
- Enable Firebase Authentication.
- Restrict write/update/delete operations to trusted admins.
- Restrict reads if quiz content should not be public.
- Do not store answer keys in data that students can read for a real exam.
- Prefer a backend or Cloud Function for real exam grading.

Example starting point for admin-only writes:

```json
{
  "rules": {
    "quizzes": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('admins').child(auth.uid).val() === true"
    },
    "admins": {
      ".read": false,
      ".write": false
    }
  }
}
```

For self-study quizzes, storing the correct answer in the client is acceptable. For real exams, keep correct answers on the server and submit only student choices for grading.
