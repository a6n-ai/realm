# Skeleton audit (dev-only)

One-time visual aid — NOT in CI. Confirms every route's loading skeleton
matches its resolved content at desktop + mobile, and flags the
generic-then-exact double flash.

1. Start dev + be logged in as staff (skeletons behind auth need a session):
   `pnpm --filter tiffin-grab dev`, then log in once; the harness reuses
   `storageState` if present.
2. Run: `AUDIT_BASE_URL=http://localhost:3000 pnpm --filter tiffin-grab audit:skeletons`
3. Open `skeleton-audit/out/report.html`. Each row: route × viewport, with
   the captured skeleton frame(s) beside the loaded frame, and a DOUBLE-FLASH
   flag if more than one distinct skeleton layer was seen.
