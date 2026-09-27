const fs = require('fs');

// 1. page.tsx
let p = 'apps/xplorers/app/(customer)/me/page.tsx';
let code = fs.readFileSync(p, 'utf8');
code = code.replace(/"We'll"/g, `"We&apos;ll"`).replace(/'We'll'/g, `"We&apos;ll"`).replace(/We'll/g, `We&apos;ll`);
code = code.replace(/won't/g, `won&apos;t`);
code = code.replace(/don't/g, `don&apos;t`);
code = code.replace(/it's/g, `it&apos;s`);
code = code.replace(/you're/g, `you&apos;re`);
fs.writeFileSync(p, code);

// 2. claim-form.tsx
p = 'apps/xplorers/app/(customer)/me/pay/claim-form.tsx';
code = fs.readFileSync(p, 'utf8');
code = code.replace(/We'll/g, `We&apos;ll`);
code = code.replace(/won't/g, `won&apos;t`);
code = code.replace(/don't/g, `don&apos;t`);
code = code.replace(/it's/g, `it&apos;s`);
code = code.replace(/you're/g, `you&apos;re`);
fs.writeFileSync(p, code);

// 3. site-header.tsx
p = 'apps/xplorers/components/marketing/site-header.tsx';
code = fs.readFileSync(p, 'utf8');
code = code.replace('setOpen(false);', 'setTimeout(() => setOpen(false), 0);');
fs.writeFileSync(p, code);

