import { parseRaw, questionsToRaw } from "../src/modules/parser.js";

function assertEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${message}\nExpected: ${expectedStr}\nActual: ${actualStr}`);
  }
}

function assertTrue(condition, message) {
  if (!condition) throw new Error(message);
}

function runTests() {
  console.log("Running parser tests...\n");

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✅ ${name}`);
      passed++;
    } catch (error) {
      console.log(`❌ ${name}: ${error.message}`);
      failed++;
    }
  }

  test("Basic single-choice question", () => {
    const raw = `1 - What is 2+2?
a) 3
*b) 4
c) 5`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].text, "What is 2+2?");
    assertEqual(questions[0].options.length, 3);
    assertEqual(questions[0].correctIndexes, [1]);
    assertEqual(questions[0].options[1].letter, "B");
  });

  test("Multiple correct answers", () => {
    const raw = `1 - Which are prime numbers?
*a) 2
*b) 3
c) 4
*d) 5`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].correctIndexes, [0, 1, 3]);
  });

  test("Question with explanation, tags, and difficulty", () => {
    const raw = `1 - What is the capital of France?
a) London
*b) Paris
c) Berlin
explanation: Paris is the capital city of France.
tags: geography, europe
difficulty: easy`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].explanation, "Paris is the capital city of France.");
    assertEqual(questions[0].tags, ["geography", "europe"]);
    assertEqual(questions[0].difficulty, "easy");
  });

  test("Multiple questions", () => {
    const raw = `1 - Question one?
*a) Answer 1
b) Answer 2

2 - Question two?
a) Answer A
*b) Answer B`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 2);
    assertEqual(questions[0].text, "Question one?");
    assertEqual(questions[1].text, "Question two?");
    assertEqual(questions[0].correctIndexes, [0]);
    assertEqual(questions[1].correctIndexes, [1]);
  });

  test("Bracket format options", () => {
    const raw = `1 - Question with brackets?
*[a] Option A
[b] Option B
*[c] Option C`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].options[0].letter, "A");
    assertEqual(questions[0].options[1].letter, "B");
    assertEqual(questions[0].options[2].letter, "C");
    assertEqual(questions[0].correctIndexes, [0, 2]);
  });

  test("Double dash format", () => {
    const raw = `1 - Question with dashes?
a) -- Option A
*b) -- Option B`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].options[0].text, "Option A");
    assertEqual(questions[0].options[1].text, "Option B");
  });

  test("Multi-line option text", () => {
    const raw = `1 - Question?
a) This is a very long option
   that spans multiple lines
*b) Short option`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertTrue(questions[0].options[0].text.includes("spans multiple lines"));
  });

  test("Câu format (Vietnamese)", () => {
    const raw = `Câu 1 - Nội dung câu hỏi?
a) Đáp án A
*b) Đáp án đúng`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].text, "Nội dung câu hỏi?");
  });

  test("Question format (English)", () => {
    const raw = `Question 1 - Content?
a) Option A
*b) Correct option`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].text, "Content?");
  });

  test("Missing correct answer produces error", () => {
    const raw = `1 - Question?
a) Option A
b) Option B`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(questions.length, 0);
    assertTrue(errors.length > 0);
    assertTrue(errors[0].includes("correct answer"));
  });

  test("Less than 2 options produces error", () => {
    const raw = `1 - Question?
*a) Only one option`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(questions.length, 0);
    assertTrue(errors.length > 0);
    assertTrue(errors[0].includes("at least 2 options"));
  });

  test("Empty question text produces error", () => {
    const raw = `1 - 
*a) Option A
b) Option B`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(questions.length, 0);
    assertTrue(errors.length > 0);
    assertTrue(errors[0].includes("missing question text"));
  });

  test("questionsToRaw round-trip", () => {
    const original = `1 - What is 2+2?
a) 3
*b) 4
c) 5
explanation: Basic arithmetic
tags: math, arithmetic
difficulty: easy`;

    const { questions } = parseRaw(original);
    const regenerated = questionsToRaw(questions);
    const { questions: reparsed } = parseRaw(regenerated);

    assertEqual(reparsed.length, questions.length);
    assertEqual(reparsed[0].text, questions[0].text);
    assertEqual(reparsed[0].correctIndexes, questions[0].correctIndexes);
    assertEqual(reparsed[0].explanation, questions[0].explanation);
    assertEqual(reparsed[0].tags, questions[0].tags);
    assertEqual(reparsed[0].difficulty, questions[0].difficulty);
  });

  test("Mixed correct/incorrect with various formats", () => {
    const raw = `1 - Mixed formats?
*a) Star prefix
b) Normal
[c] Bracket format
*[d] Star bracket`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].options.length, 4);
    assertEqual(questions[0].correctIndexes, [0, 3]);
  });

  test("Handles extra whitespace", () => {
    const raw = `  1   -   Question with spaces?   
  a)  Option A  
  *b)  Option B   `;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].text, "Question with spaces?");
    assertEqual(questions[0].options[0].text, "Option A");
    assertEqual(questions[0].options[1].text, "Option B");
  });

  test("Handles Windows line endings", () => {
    const raw = "1 - Question?\r\na) Option A\r\n*b) Option B";

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].correctIndexes, [1]);
  });

  test("Handles Mac line endings", () => {
    const raw = "1 - Question?\ra) Option A\r*b) Option B";

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 1);
    assertEqual(questions[0].correctIndexes, [1]);
  });

  test("Ignores empty lines between questions", () => {
    const raw = `1 - Question one?
*a) Answer
b) Another option

2 - Question two?
*b) Answer
c) Another option`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions.length, 2);
  });

  test("Tags with spaces and commas", () => {
    const raw = `1 - Question?
*a) Answer
b) Another option
tags: tag one, tag two, tag-three`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions[0].tags, ["tag one", "tag two", "tag-three"]);
  });

  test("Difficulty case insensitive", () => {
    const raw = `1 - Question?
*a) Answer
b) Another option
difficulty: HARD`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions[0].difficulty, "hard");
  });

  test("Explanation with colon in text", () => {
    const raw = `1 - Question?
*a) Answer
b) Another option
explanation: The answer is A: because it's first`;

    const { questions, errors } = parseRaw(raw);
    assertEqual(errors.length, 0);
    assertEqual(questions[0].explanation, "The answer is A: because it's first");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();