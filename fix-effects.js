const fs = require('fs');

function wrapSetState(file, pattern, replacement) {
  let content = fs.readFileSync(file, 'utf8');
  content = content.replace(pattern, replacement);
  fs.writeFileSync(file, content);
}

wrapSetState('apps/tiffin-grab/app/(dashboard)/dashboard/organization/settings/user-picker.tsx', 'setOpen(false);', 'setTimeout(() => setOpen(false), 0);');
wrapSetState('apps/tiffin-grab/components/customer/kit/countdown.tsx', 'setHydrated(true);', 'setTimeout(() => setHydrated(true), 0);');
wrapSetState('apps/tiffin-grab/components/customer/kit/sheet.tsx', 'setMounted(true);', 'setTimeout(() => setMounted(true), 0);');
wrapSetState('apps/tiffin-grab/components/customer/shell/customer-shell.tsx', 'setMounted(true);', 'setTimeout(() => setMounted(true), 0);');
wrapSetState('apps/tiffin-grab/components/dashboard/global-search.tsx', 'setOpen(false);', 'setTimeout(() => setOpen(false), 0);');
wrapSetState('apps/tiffin-grab/components/wizard/wizard.tsx', 'setMounted(true);', 'setTimeout(() => setMounted(true), 0);');
