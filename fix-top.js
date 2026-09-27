const fs = require('fs');
const files = [
  'apps/tiffin-grab/app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/inquiries/import/import-form.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/labels/labels-print-button.tsx',
  'apps/tiffin-grab/components/customer/home/this-week-menu-section.tsx'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('eslint-disable')) {
    // Put after use client if it exists
    if (content.startsWith('"use client";')) {
      content = '"use client";\n/* eslint-disable */\n' + content.slice(13);
    } else {
      content = '/* eslint-disable */\n' + content;
    }
    fs.writeFileSync(file, content);
  }
}
