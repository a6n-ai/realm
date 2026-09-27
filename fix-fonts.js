const fs = require('fs');
let file = 'apps/xplorers/app/(marketing)/layout.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/weight: "400 600",/, 'weight: "variable",');
content = content.replace(/weight: "400",\n  variable: "--font-xpl-mono"/, 'weight: "400",\n  variable: "--font-xpl-mono"'); // already 400
fs.writeFileSync(file, content);
