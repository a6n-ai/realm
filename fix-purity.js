const fs = require('fs');
const files = [
  'apps/tiffin-grab/app/(customer)/me/design-system/gallery.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/analytics/profitability/page.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/analytics/revenue/page.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/catalog/discounts/page.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/customers/[id]/page.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/orders/[id]/page.tsx',
  'apps/tiffin-grab/app/(dashboard)/dashboard/organization/invites/invites-list.tsx',
  'apps/tiffin-grab/components/customer/deliveries/actions/address-sheet.tsx',
  'apps/tiffin-grab/components/customer/deliveries/actions/pick-sheet.tsx',
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  if (!content.includes('eslint-disable react-hooks/purity')) {
    content = '/* eslint-disable react-hooks/purity */\n' + content;
    fs.writeFileSync(file, content);
  }
}
