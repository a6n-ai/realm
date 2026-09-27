const fs = require('fs');

function wrapSetState(file, pattern, replacement) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(pattern, replacement);
  fs.writeFileSync(file, content);
}

wrapSetState('apps/tiffin-grab/components/wizard/wizard.tsx', '{ setResult(null); return; }', '{ setTimeout(() => setResult(null), 0); return; }');
