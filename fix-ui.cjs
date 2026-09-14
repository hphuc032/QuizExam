const fs = require('fs');
let content = fs.readFileSync('D:/QuizLab/src/modules/ui.js', 'utf8');
const lines = content.split('\n');
// Fix: replace the three quotes with escaped quote
lines[5] = '    .replace(/"/g, "\"");';
fs.writeFileSync('D:/QuizLab/src/modules/ui.js', lines.join('\n'));
console.log('Fixed');