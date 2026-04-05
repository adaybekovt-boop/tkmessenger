const fs = require('fs');

const main = fs.readFileSync('src/main.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

const isStrict = process.argv.includes('--strict');

const DYNAMIC_ID_PATTERNS = [
  /^friend-/,
  /^chat-/,
  /^msg-/,
  /^peer-/
];

// Check both direct getElementById and helper `on('id', ...)` calls
const regex = /(?:document\.getElementById|on)\(['"]([^'"]+)['"]/g;

let match;
let errors = 0;
let warnings = 0;

while ((match = regex.exec(main)) !== null) {
  const id = match[1];
  
  // Exclude 'click', 'change', etc. matched by the loosely written on('event')
  if (id === 'click' || id === 'keydown' || id === 'input' || id === 'change' || id === 'submit') continue;

  if (!html.includes('id="' + id + '"')) {
    const isDynamic = DYNAMIC_ID_PATTERNS.some(pattern => pattern.test(id));
    
    if (isDynamic) {
      if (isStrict) {
        console.error('ERROR (STRICT): MISSING IN HTML (Dynamic pattern matched):', id);
        errors++;
      } else {
        console.warn('WARN: MISSING IN HTML (Dynamic pattern ignored):', id);
        warnings++;
      }
    } else {
      console.error('ERROR: MISSING IN HTML:', id);
      errors++;
    }
  }
}

if (errors > 0 || warnings > 0) {
  console.log(`\nCheck complete: ${errors} errors, ${warnings} warnings.`);
  if (errors > 0) process.exit(1);
} else {
  console.log('PASS: All IDs found in HTML.');
}
