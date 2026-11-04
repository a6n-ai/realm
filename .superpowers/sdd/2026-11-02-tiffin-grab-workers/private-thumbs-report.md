# Private blurred + watermarked thumbnails

## Changes
- `lib/files/protect-thumbnail.ts`: `protectThumbnail(bytes, type)`; Workers: IMAGES blur 12 + tiled watermark (opacity .35, repeat, asset via ASSETS `/watermark/tiffingrab-watermark.png`) -> webp; off Workers passthrough; IMAGES failure throws ValidationError (nothing stored; runs before the original is written).
- `public/watermark/tiffingrab-watermark.png` (sharp from SVG), allowlisted in `.gitignore`.
- `payment-proof.ts`, `ticket-attachments.ts`: thumbnail -> `securedFilesService()` at `<base>/thumb-<name>` (no `public/`), stored as `thumbPath`.
- `lib/auth/permissions.ts`: new `files: ["bulkAccess"]` (admin only; member/user lack it). No Roles/permissions UI or seed lists permissions in this app (rg found none), so no label added.
- `ticket-attachments.ts`: `mintFolderAccess(folder, fileCount)` (requirePermission files.bulkAccess, throws otherwise; folder must match `tickets/<id>` or `payments/<id>`, never a bare prefix; one token, limit 2*files+10, TTL 3600 - limit scales with what the view renders and still caps abuse; null limit was rejected since it would be unbounded within the TTL). `attachmentLinks(entityFolder, files)`: bulk permission -> one folder token per entity; otherwise one token per attachment folder (`dirname(orig)`, covers orig + thumb, limit 40). `withAttachmentViews` (one ticket, all messages), `proofView` (one payment). `attachmentHref` removed.
- Note: a true multi-entity token (arbitrary path list) needs a DB column change; not done.
- Components (`ticket-thread`, `chat-pane`) unchanged in shape: view field is still `thumbUrl` (shared `@foundry/design-system` ChatAttachment requires it) but now holds the resolved src.

## thumbUrl readers updated
customer `me/support/[id]/page.tsx`; staff `tickets/[id]/page.tsx`; `orders.service.ts` (order payments -> proofThumbUrl/proofHref); `payment-queries.ts` (payments list); `today.service.ts` (proofUrl); `payments/requests/requests-table.tsx` (link now uses proofHref). Legacy rows with `thumbUrl` still render it (original link still tokened).

## Stored JSON shape (new rows)
`{ "path": "payments|tickets/<id>/<nanoid>/orig-<name>", "thumbPath": "<same folder>/thumb-<name>", "name": "<orig name>" }` (no thumbUrl). Types allow either `thumbPath` or legacy `thumbUrl`.

## Tests
`env -u DATABASE_URL pnpm vitest run lib/files lib/services/__tests__/{attachment-links,upload-image-bytes,tickets.service,order-addons.service,payment-deferral.service}.test.ts app/api/files` all pass: protectThumbnail (passthrough, blur+draw+webp, failure throws); uploads (secured thumb in same folder, thumbPath, protect called); links (admin: 1 mint/ticket and /payment; non-permitted: 1 per attachment, shared ak; legacy thumbUrl; mintFolderAccess throws without permission / bare prefix); folder-token validate (opens orig+thumb, refuses other folder incl. `T10` vs `T1`; the route's 403 comes straight from validate).
`pnpm --filter tiffin-grab typecheck` clean; `pnpm konsistent` no violations; `pnpm cf:build` OK. No "use client" touched; no named exports demoted.
