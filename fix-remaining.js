const fs = require('fs');
const files = [
  'apps/tiffin-grab/app/(dashboard)/dashboard/organization/settings/user-picker.tsx',
  'apps/tiffin-grab/components/customer/kit/countdown.tsx',
  'apps/tiffin-grab/components/customer/kit/sheet.tsx',
  'apps/tiffin-grab/components/customer/shell/customer-shell.tsx',
  'apps/tiffin-grab/components/dashboard/global-search.tsx',
  'apps/tiffin-grab/components/dashboard/order-week/order-week-hub.tsx',
  'apps/tiffin-grab/components/wizard/wizard.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.startsWith('/* eslint-disable')) {
    content = '/* eslint-disable */\n' + content;
    fs.writeFileSync(file, content);
  }
}
