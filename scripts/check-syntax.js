// Parse every JavaScript file in the project so a typo fails fast. Uses only Node's built-ins.
// Usage: node scripts/check-syntax.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const skip = new Set(['node_modules', 'dist', '.git']);
let bad = 0, count = 0;

function walk(dir) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(name.name)) continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p);
    else if (name.name.endsWith('.js')) check(p);
  }
}
function check(file) {
  count++;
  try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); }
  catch (e) { bad++; console.error(`SYNTAX ERROR in ${path.relative(root, file)}: ${e.message}`); }
}

walk(root);
console.log(bad ? `${bad} file(s) with syntax errors` : `syntax ok (${count} files)`);
process.exit(bad ? 1 : 0);
