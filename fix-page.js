const fs = require('fs');
let p = 'apps/xplorers/app/(customer)/me/page.tsx';
let code = fs.readFileSync(p, 'utf8');
code = code.replace(/what's/g, "what&apos;s");
fs.writeFileSync(p, code);
