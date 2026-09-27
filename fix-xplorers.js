const fs = require('fs');

let p1 = 'apps/xplorers/app/(customer)/me/page.tsx';
let c1 = fs.readFileSync(p1, 'utf8');
c1 = c1.replace(/We'll/g, 'We&apos;ll').replace(/we'll/g, 'we&apos;ll').replace(/won't/g, 'won&apos;t').replace(/you're/g, 'you&apos;re');
fs.writeFileSync(p1, c1);

let p2 = 'apps/xplorers/app/(customer)/me/pay/claim-form.tsx';
let c2 = fs.readFileSync(p2, 'utf8');
c2 = c2.replace(/We'll/g, 'We&apos;ll').replace(/we'll/g, 'we&apos;ll').replace(/won't/g, 'won&apos;t').replace(/you're/g, 'you&apos;re');
fs.writeFileSync(p2, c2);

let p3 = 'apps/xplorers/components/marketing/site-header.tsx';
let c3 = fs.readFileSync(p3, 'utf8');
c3 = c3.replace('setOpen(false);', 'setTimeout(() => setOpen(false), 0);');
fs.writeFileSync(p3, c3);
