# Phone/Email Validation + React Hook Form Migration — Design

**Date:** 2026-06-22
**Branch:** fast-follow/slice4-order-mgmt (or a fresh feature branch)
**Status:** Approved (design)

## Goal

Replace ad-hoc, North-America-only phone validation and hand-rolled `useState`
forms with:

1. A shared, framework-agnostic validation layer in `@tiffin/commons` (zod +
   libphonenumber-js) used by **both** client forms and server actions — one
   source of truth.
2. A real phone-number input (country picker, per-country validation) defaulting
   its country to the app's configured timezone.
3. `react-hook-form` + `zodResolver` for every data-entry form in the app.
4. Canonical **E.164** phone storage (`+16475550100`).

## Decisions (locked)

- **Phone validation:** real per-country validation via `libphonenumber-js`;
  store E.164. Replaces the regex `isValidCaPhone`. (vs. keep loose regex)
- **RHF rollout:** migrate all data-entry forms now. (vs. phone/email forms only)
- **zod location:** `@tiffin/commons` so schemas are shared client + server.
- **Admin editors** (catalog `resource-editor`, `dishes-editor`, `menu-builder`):
  migrated to RHF for consistency.
- **Wizard steps** (bundle/duration/schedule): left as-is — they are choice
  pickers, not validated field entry. The checkout *contact* form inside the
  flow IS migrated.

## Current state (baseline)

- Deps already present in `apps/web/package.json`, currently **unused**:
  `react-hook-form@7.79`, `@hookform/resolvers@5.4`, `zod@4.4`.
- Backend validation lives in `apps/web/lib/services/users-contact.ts`:
  `isValidCaPhone` (regex `/^\+?1?\d{10}$/`), `isValidEmail`, `normalizeEmail`.
  Wired into server actions (e.g. `contact/actions.ts`).
- Every form is hand-rolled `useState` + `useTransition` calling a server action.
- App timezone: `app-settings` service exposes `{ timezone, cutoffHour }`.
  `timezone` is an IANA string; allowed zones are Canada `America/*` +
  `Asia/Kolkata` + `UTC`. Memory: staff IST, customers Canada.
- `@tiffin/commons` has no `zod` or `libphonenumber-js` dependency yet.

## Architecture

### Layer 1 — `@tiffin/commons` `contact/` module (shared)

New deps on commons: `zod`, `libphonenumber-js`.

Exports:
- `phoneSchema`: `z.string()` → `.refine(isValidPhoneNumber)` →
  `.transform(v => parsePhoneNumber(v).format("E.164"))`. Country-aware (a
  factory `phoneSchema(defaultCountry)` so bare national numbers can be parsed
  against the form's default country).
- `emailSchema`: `z.string().trim().toLowerCase().email()`. Optional variant for
  forms where email is optional (`emailSchema.optional().or(z.literal(""))`).
- Per-form composed schemas: `contactInquirySchema`, `accountContactSchema`,
  `checkoutContactSchema`, `orderContactSchema`, `loginSchema`,
  `appSettingsSchema`. Each form's client resolver and its server action import
  the same schema.
- `tzToDefaultCountry(timezone: string): CountryCode` — `America/*`→`'CA'`,
  `Asia/Kolkata`→`'IN'`, `UTC`/unknown→`'CA'`.

Rationale: framework-agnostic (no Next/React imports), runs in browser and Node,
matches the existing "shared code → commons" convention.

### Layer 2 — `components/ui/phone-input.tsx` (shadcn)

Add the community `shadcn-phone-input` component (built on
`react-phone-number-input` + `libphonenumber-js`) and theme it to match the
shadcn `Input`/`Select`. New dep: `react-phone-number-input`. Props of interest:
`value` (E.164 string), `onChange`, `defaultCountry`. Integrates with RHF via a
`Controller` (it is not a native input).

### Layer 3 — Forms (react-hook-form + zodResolver)

Each data-entry form:
- `useForm({ resolver: zodResolver(schema), defaultValues })`.
- Phone field rendered via `<Controller>` wrapping `<PhoneInput>`; other fields
  via `register`.
- `defaultCountry` comes from `getAppSettings().timezone` →
  `tzToDefaultCountry`, passed as a prop from the server component (public forms
  included — the page is a server component that can call `getAppSettings`).
- Field errors render inline under each input from `formState.errors`.

### Backend validation

Every server action that takes contact data calls `schema.parse(input)` at the
top (the same schema the client uses). A zod failure is mapped to the existing
`ValidationError` (first issue's message) so callers see the same error type.
Phone is persisted in E.164 (the schema's transform output). `isValidCaPhone` is
removed; `users-contact.ts` either re-exports from commons or is deleted once all
callers migrate.

## Country-default data flow

```
app-settings.timezone (DB)
  → getAppSettings()            [server component / action]
  → tzToDefaultCountry(tz)      [@tiffin/commons]
  → <Form defaultCountry={cc}>  [server → client prop]
  → <PhoneInput defaultCountry> [react-phone-number-input]
```

One app-wide default (the business operates in a single configured timezone).

## Storage / migration

Phone columns (`users.phone`, `inquiries.phone`, `orders.*`) are `text`; new
writes are E.164. **No DB migration.** Existing rows are left as-is; reads remain
tolerant. A backfill to normalize legacy values is explicitly out of scope.

## Form inventory

**In scope (migrated to RHF + zod):**
- `app/(marketing)/contact/contact-form.tsx` — phone, email *(phone/email)*
- `app/(dashboard)/dashboard/inquiries/new-inquiry-form.tsx` *(phone/email)*
- `app/(dashboard)/dashboard/inquiries/[id]/order/order-form.tsx` *(phone/email)*
- `app/(dashboard)/dashboard/account/account-form.tsx` *(phone/email)*
- `components/checkout/checkout.tsx` (contact step) *(phone/email)*
- `app/(auth)/login/login-form.tsx`
- `app/(dashboard)/dashboard/settings/general/settings-form.tsx`
- `app/(dashboard)/dashboard/catalog/[resource]/resource-editor.tsx`
- `app/(dashboard)/dashboard/dishes/dishes-editor.tsx`
- `app/(dashboard)/dashboard/menus/menu-builder.tsx`

**Out of scope (not validated data-entry forms):** list filters
(orders/inquiries/customers lists), action toggles (`lifecycle-controls`,
`inquiry-controls`, `slot-toggle`, `user-row`), `meals-grid` selection, wizard
step pickers (`step-bundle/duration/schedule`), `search-input`, design demo, UI
primitives.

## Error handling

- Server: `schema.parse` throws zod error → caught/mapped to `ValidationError`
  with the first issue message (preserves current action error contract).
- Client: RHF `formState.errors` renders inline per field; submit disabled while
  `isSubmitting`.

## Testing

- **commons unit tests:** `phoneSchema` accepts valid CA (`+16475550100`,
  `6475550100` w/ default CA) and IN numbers, rejects garbage, outputs E.164;
  `emailSchema` normalizes + rejects bad; `tzToDefaultCountry` mapping table.
- **Server-action tests:** update existing inputs to E.164; add reject-invalid
  cases for phone and email.
- **Regression:** keep the current 145 tests green; `tsc --noEmit` clean.

## Risks / notes

- `react-phone-number-input` is client-only — the phone input must live in a
  `"use client"` component; the `defaultCountry` is computed server-side and
  passed as a prop.
- zod v4 is already pinned; commons must use the same major to avoid type drift.
- The caveman session hook mangles some tool-output strings (`timezone`→`n`);
  always read source files directly when exact strings matter.
