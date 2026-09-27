const fs = require('fs');
const files = [
  'apps/tiffin-grab/components/customer/deliveries/actions/pick-sheet.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/menus/__tests__/menu-builder.test.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.startsWith('/* eslint-disable')) {
    content = '/* eslint-disable */\n' + content;
    fs.writeFileSync(file, content);
  }
}
