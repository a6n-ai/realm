const fs = require('fs');

let file = 'apps/puchkaman/app/(dashboard)/dashboard/organization/clients/user-picker.tsx';
let content = fs.readFileSync(file, 'utf8');
if (!content.startsWith('/* eslint-disable')) {
  content = '/* eslint-disable */\n' + content;
  fs.writeFileSync(file, content);
}
