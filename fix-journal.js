const fs = require('fs');
let p = 'apps/tiffin-grab/db/migrations/meta/_journal.json';
let journal = JSON.parse(fs.readFileSync(p, 'utf8').replace(/<<<<<<<.*?=======/s, '').replace(/>>>>>>>.*/, ''));
// Wait, regex might be tricky. I'll just write a fresh json.
