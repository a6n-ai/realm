# Account Revamp — Understand Findings (WF1)

Source: ultracode Workflow 1 (5 readers; design-system + role-gating backfilled
by hand after agent failures).

## Account surface (current)

- Server page `app/(dashboard)/dashboard/account/page.tsx` reads `usersService.read`,
  renders `PageShell + PageHeader + AccountTabs`. **Role-blind** — `session.user.role`
  is available but never passed.
- `AccountTabs` (client) = fixed 3 tabs: Profile (AvatarField + ProfileForm),
  Contact (AccountForm phone/email + email-status Badge + ResendVerification),
  Security (ChangePasswordForm + PinSection + SignOutButton).
- Server actions `actions.ts`: `updateMyContact`, `updateMyName`, `setMyPin`,
  `removeMyPin`; avatar via `avatar-actions.ts` (`updateMyAvatar`, `removeMyAvatar`).
  All guard session, delegate to `usersService`, `revalidatePath('/dashboard/account')`.
- `ChangePasswordForm` is the one exception: calls `authClient.changePassword`
  directly (no server action). Keep as-is.
- Tests: only avatar-field, change-password-form, pin-section (smoke). No tests
  for account-form, profile-form, role gating.

**Reuse as-is (re-compose, don't rewrite):** AvatarField, ProfileForm,
AccountForm, PinSection, ChangePasswordForm, ResendVerification, SignOutButton,
all server actions, avatar actions.

## Services + schema

- `usersService extends SessionUpdatableService<typeof users>` → commons
  `UpdatableService`. Domain mutators validate → build typed patch →
  `return super.update(userId, patch)`, which auto-stamps `updatedBy` + writes
  audit. **New methods must call `super.update`, never `db.update`.**
- Pattern to copy verbatim: `updateContact` / `updateProfile`
  (users.service.ts:32-76). Use `ValidationError` from `@tiffin/commons`.
- `users` table (db/schema/auth.ts): `updatableColumns('usr')` + name, email,
  emailVerified, phoneVerified, image, phone, role, pinHash, pinAttempts,
  isSystem, bauth*. **No address/preferences columns.**
- Migration: edit `db/schema/auth.ts`, run `db:generate` (drizzle-kit) from
  apps/web → emits `0003_<slug>.sql` + snapshot + journal. Do NOT hand-write.
  Add **nullable** columns (additive, safe on live seeded DB).

**New service methods:** `updateAddress(userId, input)`,
`updatePreferences(userId, input)` — same validate→patch→super.update shape.

## Design system

- `SectionCard {title, subtitle?, action?, children}` (ds/section-card.tsx) —
  **the section primitive.** Wraps ds `Card` (p-5). Use one per account section.
- ds `Card` variants: `glow` (`card-glow`), `lift` (`hover-lift`), `flat`
  (`border`). Default glow.
- `PageShell` = `mx-auto w-full max-w-6xl space-y-6`. Keep as page chrome.
- Tokens (globals.css): warm amber/orange primary (oklch hue ~60),
  `--radius: 0.625rem`, full card/muted/accent token set, dark mode. No text
  effects (per user preference).

## Role gating

- `Role = {ADMIN:"admin", MEMBER:"member", USER:"user"}` (@tiffin/commons enums.ts).
  Guards: `requireRole` / `requireStaff` (admin+member) / `requireAdmin`.
- Sidebar (`components/dashboard/app-sidebar.tsx`): nav items carry
  `roles: string[]`; a section renders if any item matches the viewer role.
  Customer (`user`) currently sees **"My meals" + "Account"** only.
- `/dashboard/page.tsx` is staff-only and **redirects role `user` →
  `/dashboard/account`**. The customer landing = replace this redirect with a
  real `user` welcome page.

## shadcn inventory

- Installed (31): avatar, badge, button, calendar, card, command, dialog, form,
  input, input-group, label, phone-input, popover, radio-group, scroll-area,
  select, separator, sheet, sidebar, skeleton, sonner, switch, table, tabs,
  textarea, tooltip, typography, … (style `radix-nova`, registry `@cult-ui`).
- Covered by installed: address inputs (Input), province (Select — typed
  control per admin-typed-controls memory), dietary/notes (Textarea),
  notification toggles (Switch).
- **Gap:** allergens multiselect/tag input. No installed component, no
  first-party shadcn item. Hand-build a combobox-multiselect from installed
  Command + Popover + Badge (selected = removable Badges). Province options =
  data list, not a component.

## Implications for design (WF2)

- Section-based layout over fixed tabs; `SectionCard` per section; role → list
  of sections config keyed on `Role`.
- Thread `role` from page into the shared shell.
- Customer sections add address / dietary / delivery-notes / notifications;
  staff keep PIN; password + sign-out shared.
- Customer landing replaces the redirect in `/dashboard/page.tsx`.
