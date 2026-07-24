# Configurable payment methods (e-Transfer now, Stripe later) — design

Status: proposed · Date: 2026-07-22

## 1. Goal & scope

Give any Realm client app with **orders + payments** a configurable set of payment
methods, administered from Settings. First rail: **Interac e-Transfer** (a manual rail
with no API). Second rail (later): **Stripe** (online). The genuinely-shared logic lives
in a new server-only package `@realm/payments`; tiffin-grab is the first consumer and owns
its persistence + UI until a second client proves the UI should graduate to
`@realm/design-system`.

Decisions locked during brainstorming:

- **Abstraction**: config + a unified `PaymentProvider` contract with adapters (not just a
  registry, not full shared UI yet).
- **e-Transfer confirmation**: customer **claim** (they send money, then submit an Interac
  reference **and/or** a photo of the payment) → **staff verify** → paid, or reject.
- **Claim surface**: right after checkout **and** later from Finances/Bills — any unpaid
  order (initial subscription or a monthly bill) can be paid/claimed.
- **Per-method taxes**: a list of **named tax lines** per method, each a **percentage** of
  the taxable base, shown as separate line items on the total.
- **Method-gated coupons**: a coupon may be restricted to specific payment methods.
- **Consequence**: the payment method is chosen **at checkout, before the total is
  finalized**, because taxes and coupon eligibility depend on it. All pricing is
  server-side only.
- **Package boundary**: thin shared core (`@realm/payments`) + app-owned persistence & UI.

Non-goals (now): auto-reconciling e-Transfer from bank/Autodeposit emails; Stripe
implementation (interface must accommodate it, but no adapter is built in this milestone);
multiple providers on the same rail; refund automation.

## 2. Package: `@realm/payments` (server-only, not transpiled)

Ships raw `.ts` like `@realm/auth`/`@realm/commons-notify`; **never imports an app**; no DB,
no React. Pure types, validation, and math.

### 2.1 Config types + Zod schema

```ts
type TaxLine = { name: string; ratePct: number };            // ratePct: 0..100

type PaymentMethodConfig = {
  id: string;              // stable key, maps to the app's payment_method enum (e.g. "etransfer")
  kind: "manual" | "online";
  enabled: boolean;
  label: string;           // customer-facing ("Interac e-Transfer")
  instructions?: string;   // manual: how/where to send
  payeeHandle?: string;    // manual: the e-Transfer email/phone to send to
  requireProof?: boolean;  // manual: force a photo upload on claim
  taxes: TaxLine[];        // per-method tax lines (empty = no tax)
};

type PaymentConfig = {
  methods: PaymentMethodConfig[];
  defaultMethodId?: string;
};
```

- `paymentConfigSchema` (Zod) + `parsePaymentConfig(raw): PaymentConfig` +
  `DEFAULT_PAYMENT_CONFIG` (empty methods → app stays in today's *simulated* mode).
- `enabledMethods(cfg)` and `findMethod(cfg, id)` helpers.

### 2.2 Pure tax math

```ts
// Applied to the taxable base = subtotal − discount (never below 0). Rounded per line to
// cents; taxTotal is the sum of rounded lines (deterministic, matches receipts).
function computeTax(taxableBase: number, taxes: TaxLine[]):
  { lines: { name: string; ratePct: number; amount: number }[]; taxTotal: number };
```

### 2.3 Provider contract + manual adapter

```ts
type InitiateResult =
  | { kind: "manual_instructions"; instructions: string; payeeHandle: string; reference: string }
  | { kind: "redirect"; url: string }                 // online (Stripe) — future
  | { kind: "client_secret"; clientSecret: string };  // online (Stripe) — future

interface PaymentProvider {
  id: string;
  kind: "manual" | "online";
  // What the customer needs to do to pay this order. `reference` for manual is a
  // human-friendly memo (the order's deployment id) the customer includes in the transfer.
  initiate(input: { orderRef: string; amount: number; method: PaymentMethodConfig }): InitiateResult;
}
```

- `ManualProvider` implements `initiate` → `manual_instructions` from the method config
  (`payeeHandle`, `instructions`, `reference = orderRef`).
- A `providerFor(method)` factory returns the right provider by `kind` (only `ManualProvider`
  now; Stripe slots in later without touching callers).

### 2.4 Lifecycle vocabulary

Canonical statuses the package reasons about (apps map these onto their own enum):
`awaiting_payment → pending_verification → paid` with side-branches `rejected` and
`refunded`. Exposed as a `PaymentLifecycle` union + `canClaim(status)` / `canVerify(status)`
predicates so both /me and /dashboard share one rule.

### 2.5 Package tests (Vitest, pure)

`computeTax` (rounding, multi-line, zero base, empty taxes); config parse/defaults; manual
`initiate` output; lifecycle predicates.

## 3. tiffin-grab persistence & schema changes

### 3.1 Config storage (mirror `discountPolicy`)

- New jsonb column `app.payment_config`.
- `getPaymentConfig()` / `setPaymentConfig()` in `app-settings.service.ts`, cached via
  `settingsCache` with eviction on write (same pattern as `getDiscountPolicy`).

### 3.2 `payments` table

- Extend `payment_status` enum (additive):
  `simulated_paid, pending, refunded` **+** `awaiting_payment, pending_verification, paid, rejected`.
- Add columns: `reference text` (customer Interac ref), `proof_file_id bigint → files.id`,
  `claimed_at bigint`. (`captured_at` already exists → set on verify. `note` reused for
  reject reason. `created_by`/`updated_by` from session.)
- `payment_method` enum gains `stripe` in the later phase, not now.

### 3.3 `coupons` table

- Add `allowed_payment_methods text[] not null default '{}'` (empty = all methods). Mirrors
  `plan_types`. Enforced in pricing.

### 3.4 Orders

- No new columns. Extend `pricing_snapshot` to carry the method-aware breakdown:
  `{ subtotal, discount, taxLines: [{name,ratePct,amount}], taxTotal, total, paymentMethodId }`.
  The chosen method for the order is the `payments` row's `method`; the snapshot is the
  immutable receipt.

## 4. Pricing integration (server-side only)

Order of operations, all in the existing server pricing path (extended to take a
`paymentMethodId`):

1. subtotal (plan/meal math, unchanged)
2. discount = coupons (auto + entered), **rejecting any coupon whose
   `allowed_payment_methods` excludes the chosen method**
3. taxableBase = max(0, subtotal − discount)
4. tax = `computeTax(taxableBase, method.taxes)`
5. total = taxableBase + taxTotal

The client may show a live preview, but the server recomputes on confirm — never trusts a
client total (existing rule). If no method is enabled, the app stays in **simulated** mode:
no tax, current behavior preserved.

## 5. Payment lifecycle & ledger

- **Checkout confirm (real method chosen)**: `createOrder` writes the order + a `payments`
  row with `method`, `status = awaiting_payment`, `amount = total`, and **no ledger credit
  yet**.
- **Simulated mode (no method enabled)**: unchanged — simulated_paid + immediate ledger
  credit, so existing tests/behavior hold.
- **Customer claim**: sets `reference` and/or `proof_file_id`, `claimed_at`, moves
  `awaiting_payment → pending_verification`. Requires reference OR proof (proof forced when
  `requireProof`).
- **Staff verify**: `pending_verification → paid`, set `captured_at`, **now** record the
  ledger credit (the deferred `recordPayment` credit). This is the one behavioral change vs
  today (credit-on-verify, not credit-on-create) and only applies in real-method mode.
- **Staff reject**: `pending_verification → rejected` with `note`; customer may re-claim
  (back to `pending_verification`).

## 6. UI (all in tiffin-grab for now)

### 6.1 Admin — `/dashboard/settings/payments` (requireAdmin)

New settings page (added to the settings nav next to General/Meal types). Per method: enable
toggle, label, instructions, payee handle, `requireProof`, and an editable list of tax lines
(name + %). Saves via `setPaymentConfig`. Follows the existing settings-form pattern +
Suspense skeleton.

### 6.2 Customer — checkout

Add a **payment method step** before the final review: pick an enabled method; the review
shows the live per-method tax breakdown. On confirm → order created `awaiting_payment` →
show the **claim panel** (instructions + payee + reference, a reference field, and a photo
upload via `commons-files`/`image-uploader`).

### 6.3 Customer — Finances/Bills (`/me/wallet?tab=bills`)

Any order with an `awaiting_payment` or `rejected` payment shows a **Pay / I've sent it**
action opening the same claim panel. Reuses one `ClaimPayment` client component.

### 6.4 Staff — dashboard

On the order detail page, a **Payments** section listing payment rows with status; for
`pending_verification` rows: view reference + proof photo, **Verify** / **Reject (with
note)**. (A cross-order "payments to verify" queue is a later nicety, not this milestone.)

## 7. Authorization

- Admin settings: `requireAdmin`.
- Staff verify/reject: `requireStaff`.
- Customer claim: reuse the owner-or-staff guard pattern (`assertCanManageOrder`) so staff
  can also claim on a customer's behalf; audit stamps the acting user.

## 8. Key touchpoints

- New: `packages/payments/*`; `apps/tiffin-grab/app/(dashboard)/dashboard/settings/payments/*`;
  a `ClaimPayment` client component; a staff Payments section component.
- Changed: `db/schema/orders.ts` (payment_status enum, payments columns), `db/schema/coupons.ts`
  (allowed_payment_methods), `db/schema/app.ts` (payment_config); `app-settings.service.ts`
  (get/set config); `orders.service.ts` (`recordPayment` credit deferral, `createOrder`
  awaiting_payment path); the server pricing module (method-aware taxes + coupon gating);
  checkout actions/UI; `me/wallet` bills; order detail page + actions; a Drizzle migration.
- `@realm/payments` is server-only, so it is **not** added to `transpilePackages` (same as
  `@realm/auth`).

## 9. Testing

- Package: pure unit tests (§2.5).
- App: pricing with per-method taxes + method-gated coupon rejection; lifecycle transitions
  (create→claim→verify credits ledger once; reject→re-claim); claim validation (reference or
  proof; requireProof); simulated-mode regression (no method → unchanged totals + immediate
  credit).

## 10. Rollout / phases

- **P0** `@realm/payments` package (types, config schema, tax math, provider + manual
  adapter, lifecycle) + unit tests.
- **P1** Persistence (`payment_config`, get/set) + admin settings page.
- **P2** Pricing integration (method-aware taxes + coupon gating) + checkout method step +
  order/payment `awaiting_payment` creation + ledger-credit deferral.
- **P3** Customer claim (reference + photo) at checkout success and in Bills.
- **P4** Staff verify/reject + ledger credit on paid.
- **P5 (later)** Stripe online adapter + webhook confirmation; optional payments-to-verify
  queue.

Each phase is independently shippable; P0–P1 add config with zero behavior change (simulated
mode stays default until an admin enables a method).
