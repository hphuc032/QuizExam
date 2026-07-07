# QuizLab Firebase

QuizLab is a static HTML/CSS/JavaScript quiz builder that can save quiz drafts to Firebase Realtime Database.

## Use

Open `index.html` in a browser, paste a quiz, then click **Tạo đề**.

Supported question format:

```text
1 - Nội dung câu hỏi
[a]--Đáp án A
*[b]--Đáp án đúng
[c]--Đáp án C
[d]--Đáp án D
```

You can also use `A.`, `*B.`, `C.`, `D.` for answer lines.

## Firebase safety checklist

The Firebase config in `app.js` is public by design when used in a browser app. Security must come from Firebase Rules and Authentication, not from hiding the config.

Before using this with real users:

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
