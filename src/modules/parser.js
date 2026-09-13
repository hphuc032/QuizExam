function normalizeText(raw) {
  return String(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isQuestionHeader(line) {
  const trimmed = line.trim();
  if (!trimmed) return false;

  return /^câu\s*\d+\s*[:.)-]/i.test(trimmed)
    || /^question\s*\d+\s*[:.)-]/i.test(trimmed)
    || /^\d+\s*[-:.)]/.test(trimmed);
}

function parseQuestionText(line) {
  return line
    .replace(/^câu\s*\d+\s*[:.)-]\s*/i, "")
    .replace(/^question\s*\d+\s*[:.)-]\s*/i, "")
    .replace(/^\d+\s*[-:.)]\s*/, "")
    .replace(/\*+\s*$/, "")
    .trim();
}

function parseOptionLine(line) {
  const trimmed = line.trim();
  let match = trimmed.match(/^(\*)?\s*\[([a-dA-D])\]\s*(?:--\s*)?(.+)$/);
  if (match) {
    return {
      correct: Boolean(match[1]),
      letter: match[2].toUpperCase(),
      text: match[3].trim()
    };
  }

  match = trimmed.match(/^(\*)?\s*([a-dA-D])\s*[.)-]\s*(?:--\s*)?(.+)$/);
  if (match) {
    return {
      correct: Boolean(match[1]),
      letter: match[2].toUpperCase(),
      text: match[3].trim()
    };
  }

  return null;
}

export function parseRaw(raw) {
  const lines = normalizeText(raw).split("\n");
  const blocks = [];
  let current = null;

  lines.forEach((line, index) => {
    if (isQuestionHeader(line)) {
      if (current) blocks.push(current);
      current = [{ text: line.trim(), lineNumber: index + 1 }];
    } else if (current && line.trim()) {
      current.push({ text: line.trim(), lineNumber: index + 1 });
    }
  });

  if (current) blocks.push(current);

  const questions = [];
  const errors = [];

  for (const block of blocks) {
    const questionText = parseQuestionText(block[0].text);
    if (!questionText) {
      errors.push(`Line ${block[0].lineNumber}: missing question text.`);
      continue;
    }

    const options = [];
    let explanation;
    let tags;
    let difficulty;

    for (const rawLine of block.slice(1)) {
      const lineText = rawLine.text;

      const expMatch = lineText.match(/^explanation\s*[:：]\s*(.+)$/i);
      if (expMatch) {
        explanation = expMatch[1].trim();
        continue;
      }

      const tagMatch = lineText.match(/^tags?\s*[:：]\s*(.+)$/i);
      if (tagMatch) {
        tags = tagMatch[1].split(",").map(t => t.trim()).filter(Boolean);
        continue;
      }

      const diffMatch = lineText.match(/^difficulty\s*[:：]\s*(easy|medium|hard)$/i);
      if (diffMatch) {
        difficulty = diffMatch[1].toLowerCase();
        continue;
      }

      const parsedOption = parseOptionLine(lineText);
      if (parsedOption) {
        options.push(parsedOption);
      } else if (options.length > 0) {
        options[options.length - 1].text += " " + lineText.trim();
      }
    }

    const correctCount = options.filter(option => option.correct).length;
    if (options.length < 2 || correctCount < 1) {
      errors.push(`Line ${block[0].lineNumber}: need at least 2 options and at least 1 correct answer (*).`);
      continue;
    }

    const correctIndexes = options.map((opt, i) => opt.correct ? i : -1).filter(i => i !== -1);

    questions.push({
      text: questionText,
      options,
      correctIndexes,
      explanation,
      tags,
      difficulty
    });
  }

  return { questions, errors };
}

export function questionsToRaw(questions) {
  return questions.map((q, idx) => {
    const lines = [`${idx + 1} - ${q.text}`];
    q.options.forEach(opt => {
      const prefix = opt.correct ? "*" : "";
      lines.push(`${prefix}${opt.letter}) ${opt.text}`);
    });
    if (q.explanation) lines.push(`explanation: ${q.explanation}`);
    if (q.tags && q.tags.length) lines.push(`tags: ${q.tags.join(", ")}`);
    if (q.difficulty) lines.push(`difficulty: ${q.difficulty}`);
    return lines.join("\n");
  }).join("\n\n");
}

export function questionsToCsv(questions) {
  const headers = ["Question", "Option A", "Option B", "Option C", "Option D", "Correct Answer(s)", "Explanation", "Tags", "Difficulty"];
  const rows = [headers.join(",")];

  questions.forEach(q => {
    const options = ["A", "B", "C", "D"].map(letter => {
      const opt = q.options.find(o => o.letter === letter);
      return opt ? `"${opt.text.replace(/"/g, '""')}"` : "";
    });
    const correctLetters = q.correctIndexes.map(i => q.options[i]?.letter).filter(Boolean).join(";");
    const explanation = q.explanation ? `"${q.explanation.replace(/"/g, '""')}"` : "";
    const tags = q.tags ? `"${q.tags.join(";")}"` : "";
    const difficulty = q.difficulty || "";

    rows.push([q.text, ...options, correctLetters, explanation, tags, difficulty].join(","));
  });

  return rows.join("\n");
}

export function parseCsv(csvText) {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) return { questions: [], errors: ["CSV file is empty or has only headers"] };

  const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
  const questions = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCsvLine(line);
    if (values.length < 6) {
      errors.push(`Row ${i + 1}: insufficient columns`);
      continue;
    }

    const questionText = values[0]?.trim();
    if (!questionText) {
      errors.push(`Row ${i + 1}: missing question text`);
      continue;
    }

    const options = [];
    for (let j = 0; j < 4; j++) {
      const optText = values[j + 1]?.trim();
      if (optText) {
        options.push({
          letter: String.fromCharCode(65 + j),
          text: optText,
          correct: false
        });
      }
    }

    const correctAnswers = (values[5] || "").split(";").map(s => s.trim().toUpperCase()).filter(Boolean);
    options.forEach(opt => {
      if (correctAnswers.includes(opt.letter)) opt.correct = true;
    });

    const explanation = values[6]?.trim() || undefined;
    const tags = values[7] ? values[7].split(";").map(t => t.trim()).filter(Boolean) : undefined;
    const difficulty = values[8]?.trim().toLowerCase() || undefined;

    if (options.length < 2) {
      errors.push(`Row ${i + 1}: need at least 2 options`);
      continue;
    }
    if (!options.some(o => o.correct)) {
      errors.push(`Row ${i + 1}: need at least 1 correct answer`);
      continue;
    }

    const correctIndexes = options.map((opt, idx) => opt.correct ? idx : -1).filter(idx => idx !== -1);

    questions.push({
      text: questionText,
      options,
      correctIndexes,
      explanation,
      tags,
      difficulty
    });
  }

  return { questions, errors };
}

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

export async function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.0/package/xlsx.mjs");
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        const csvText = json.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
        const { questions, errors } = parseCsv(csvText);
        resolve({ questions, errors });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}