const fs = require('fs');
const main = fs.readFileSync('src/main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)\.addEventListener/g;
let match;
while ((match = regex.exec(main)) !== null) {
  const id = match[1];
  if (!html.includes('id="' + id + '"')) {
    console.log('MISSING IN HTML:', id);
  }
}
