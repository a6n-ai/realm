# Payment Methods — P0: `@realm/payments` package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the server-only `@realm/payments` package: config schema, pure per-method tax math, the `PaymentProvider` contract + manual (e-Transfer) adapter, and the shared payment lifecycle vocabulary.

**Architecture:** A leaf package with no DB, no React, and no app imports (like `@realm/auth`). Pure TypeScript + Zod + Vitest. Apps consume the types/functions and map the canonical lifecycle onto their own `payments` enum. Stripe becomes a second provider later without touching callers.

**Tech Stack:** TypeScript, Zod v4, Vitest v4.

## Global Constraints

- Package ships raw `.ts` (no build step); server-only → NOT added to any app's `transpilePackages`.
- No import cycles; this package imports only `zod` (floor-level leaf).
- `computeTax` rounds each line to cents independently; `taxTotal` = sum of rounded lines (must match printed receipts).
- Tax base = `max(0, subtotal − discount)`.
- Exhaustive `switch` over the `kind` union uses a `never` default (repo rule).
- Canonical lifecycle: `awaiting_payment → pending_verification → paid`, side-branches `rejected`, `refunded`.

---

### Task 1: Scaffold package + config schema

**Files:**
- Create: `packages/payments/package.json`
- Create: `packages/payments/tsconfig.json`
- Create: `packages/payments/vitest.config.ts`
- Create: `packages/payments/src/config.ts`
- Create: `packages/payments/src/index.ts`
- Test: `packages/payments/src/__tests__/config.test.ts`

**Interfaces:**
- Produces: `TaxLine`, `PaymentMethodConfig`, `PaymentConfig` types; `paymentConfigSchema`, `parsePaymentConfig(raw: unknown): PaymentConfig`, `DEFAULT_PAYMENT_CONFIG`, `enabledMethods(cfg): PaymentMethodConfig[]`, `findMethod(cfg, id): PaymentMethodConfig | undefined`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/payments/src/__tests__/config.test.ts
import { describe, it, expect } from "vitest";
import {
  parsePaymentConfig,
  enabledMethods,
  findMethod,
  DEFAULT_PAYMENT_CONFIG,
  type PaymentConfig,
} from "../index";

const sample: PaymentConfig = {
  methods: [
    { id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer",
      payeeHandle: "pay@tiffin.ca", instructions: "Send to the email", requireProof: true,
      taxes: [{ name: "GST", ratePct: 5 }] },
    { id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] },
  ],
};

describe("parsePaymentConfig", () => {
  it("returns the default (no methods) for empty/invalid input", () => {
    expect(parsePaymentConfig(undefined)).toEqual(DEFAULT_PAYMENT_CONFIG);
    expect(parsePaymentConfig({ methods: [{ id: "x" }] })).toEqual(DEFAULT_PAYMENT_CONFIG);
  });
  it("parses a valid config and applies field defaults", () => {
    const cfg = parsePaymentConfig(sample);
    expect(cfg.methods).toHaveLength(2);
    expect(cfg.methods[1].taxes).toEqual([]);
  });
});

describe("selectors", () => {
  it("enabledMethods returns only enabled", () => {
    expect(enabledMethods(sample).map((m) => m.id)).toEqual(["etransfer"]);
  });
  it("findMethod finds by id", () => {
    expect(findMethod(sample, "cash")?.label).toBe("Cash");
    expect(findMethod(sample, "nope")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @realm/payments test`
Expected: FAIL — package/module not found (`Cannot find package '@realm/payments'` or missing `../index`).

- [ ] **Step 3: Write minimal implementation**

```json
// packages/payments/package.json
{
  "name": "@realm/payments",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "zod": "^4.4.3" },
  "devDependencies": { "typescript": "^5", "vitest": "^4.1.9" }
}
```

```json
// packages/payments/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

```ts
// packages/payments/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

```ts
// packages/payments/src/config.ts
import { z } from "zod";

export const taxLineSchema = z.object({
  name: z.string().min(1),
  ratePct: z.number().min(0).max(100),
});
export type TaxLine = z.infer<typeof taxLineSchema>;

export const paymentMethodConfigSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["manual", "online"]),
  enabled: z.boolean().default(false),
  label: z.string().min(1),
  instructions: z.string().optional(),
  payeeHandle: z.string().optional(),
  requireProof: z.boolean().optional(),
  taxes: z.array(taxLineSchema).default([]),
});
export type PaymentMethodConfig = z.infer<typeof paymentMethodConfigSchema>;

export const paymentConfigSchema = z.object({
  methods: z.array(paymentMethodConfigSchema).default([]),
  defaultMethodId: z.string().optional(),
});
export type PaymentConfig = z.infer<typeof paymentConfigSchema>;

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = { methods: [] };

// NULL/garbage config → simulated mode (no methods). Never throws on read.
export function parsePaymentConfig(raw: unknown): PaymentConfig {
  const parsed = paymentConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_PAYMENT_CONFIG;
}

export function enabledMethods(cfg: PaymentConfig): PaymentMethodConfig[] {
  return cfg.methods.filter((m) => m.enabled);
}

export function findMethod(cfg: PaymentConfig, id: string): PaymentMethodConfig | undefined {
  return cfg.methods.find((m) => m.id === id);
}
```

```ts
// packages/payments/src/index.ts
export * from "./config";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm install && pnpm --filter @realm/payments test`
Expected: PASS (4 tests). `pnpm install` links the new workspace package.

- [ ] **Step 5: Commit**

```bash
git add packages/payments
git commit -m "feat(payments): @realm/payments package + config schema"
```

---

### Task 2: Pure per-method tax math

**Files:**
- Create: `packages/payments/src/tax.ts`
- Modify: `packages/payments/src/index.ts` (add `export * from "./tax";`)
- Test: `packages/payments/src/__tests__/tax.test.ts`

**Interfaces:**
- Consumes: `TaxLine` from `./config`.
- Produces: `ComputedTaxLine = { name: string; ratePct: number; amount: number }`, `TaxBreakdown = { lines: ComputedTaxLine[]; taxTotal: number }`, `computeTax(taxableBase: number, taxes: TaxLine[]): TaxBreakdown`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/payments/src/__tests__/tax.test.ts
import { describe, it, expect } from "vitest";
import { computeTax } from "../index";

describe("computeTax", () => {
  it("returns zero for no tax lines", () => {
    expect(computeTax(100, [])).toEqual({ lines: [], taxTotal: 0 });
  });
  it("computes multiple lines, each rounded to cents", () => {
    const r = computeTax(100, [{ name: "GST", ratePct: 5 }, { name: "PST", ratePct: 7 }]);
    expect(r.lines).toEqual([
      { name: "GST", ratePct: 5, amount: 5 },
      { name: "PST", ratePct: 7, amount: 7 },
    ]);
    expect(r.taxTotal).toBe(12);
  });
  it("rounds each line independently (13.333 base @ 5% => 0.67)", () => {
    const r = computeTax(13.333, [{ name: "GST", ratePct: 5 }]);
    expect(r.lines[0].amount).toBe(0.67);
    expect(r.taxTotal).toBe(0.67);
  });
  it("clamps a negative base to 0", () => {
    expect(computeTax(-50, [{ name: "GST", ratePct: 5 }])).toEqual({
      lines: [{ name: "GST", ratePct: 5, amount: 0 }],
      taxTotal: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @realm/payments test tax`
Expected: FAIL — `computeTax` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/payments/src/tax.ts
import type { TaxLine } from "./config";

export type ComputedTaxLine = { name: string; ratePct: number; amount: number };
export type TaxBreakdown = { lines: ComputedTaxLine[]; taxTotal: number };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Tax applies to `taxableBase` (subtotal − discount, clamped ≥ 0). Each line is rounded to
// cents on its own; taxTotal sums the rounded lines so it matches the printed receipt.
export function computeTax(taxableBase: number, taxes: TaxLine[]): TaxBreakdown {
  const base = Math.max(0, taxableBase);
  const lines: ComputedTaxLine[] = taxes.map((t) => ({
    name: t.name,
    ratePct: t.ratePct,
    amount: round2(base * (t.ratePct / 100)),
  }));
  const taxTotal = round2(lines.reduce((sum, l) => sum + l.amount, 0));
  return { lines, taxTotal };
}
```

```ts
// packages/payments/src/index.ts
export * from "./config";
export * from "./tax";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @realm/payments test`
Expected: PASS (all config + tax tests).

- [ ] **Step 5: Commit**

```bash
git add packages/payments
git commit -m "feat(payments): pure per-method tax computation"
```

---

### Task 3: Provider contract + manual (e-Transfer) adapter

**Files:**
- Create: `packages/payments/src/provider.ts`
- Create: `packages/payments/src/manual.ts`
- Modify: `packages/payments/src/index.ts` (add exports)
- Test: `packages/payments/src/__tests__/manual.test.ts`

**Interfaces:**
- Consumes: `PaymentMethodConfig` from `./config`.
- Produces: `InitiateInput = { orderRef: string; amount: number; method: PaymentMethodConfig }`; `InitiateResult` union (`manual_instructions` | `redirect` | `client_secret`); `PaymentProvider` interface (`id`, `kind`, `initiate(input): InitiateResult`); `ManualProvider` class; `providerFor(method: PaymentMethodConfig): PaymentProvider`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/payments/src/__tests__/manual.test.ts
import { describe, it, expect } from "vitest";
import { ManualProvider, providerFor, type PaymentMethodConfig } from "../index";

const method: PaymentMethodConfig = {
  id: "etransfer", kind: "manual", enabled: true, label: "Interac e-Transfer",
  payeeHandle: "pay@tiffin.ca", instructions: "Send an e-Transfer to the email above.",
  taxes: [],
};

describe("ManualProvider.initiate", () => {
  it("returns manual instructions with the payee handle and order reference", () => {
    const p = new ManualProvider("etransfer");
    const r = p.initiate({ orderRef: "ord_ABC", amount: 120, method });
    expect(r).toEqual({
      kind: "manual_instructions",
      instructions: "Send an e-Transfer to the email above.",
      payeeHandle: "pay@tiffin.ca",
      reference: "ord_ABC",
    });
  });
});

describe("providerFor", () => {
  it("returns a ManualProvider for a manual method", () => {
    expect(providerFor(method)).toBeInstanceOf(ManualProvider);
  });
  it("throws for an online method (no adapter yet)", () => {
    expect(() => providerFor({ ...method, kind: "online" })).toThrow(/not implemented/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @realm/payments test manual`
Expected: FAIL — `ManualProvider` / `providerFor` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/payments/src/provider.ts
import type { PaymentMethodConfig } from "./config";

export type InitiateResult =
  | { kind: "manual_instructions"; instructions: string; payeeHandle: string; reference: string }
  | { kind: "redirect"; url: string }
  | { kind: "client_secret"; clientSecret: string };

export type InitiateInput = { orderRef: string; amount: number; method: PaymentMethodConfig };

export interface PaymentProvider {
  id: string;
  kind: "manual" | "online";
  initiate(input: InitiateInput): InitiateResult;
}
```

```ts
// packages/payments/src/manual.ts
import type { PaymentMethodConfig } from "./config";
import type { InitiateInput, InitiateResult, PaymentProvider } from "./provider";

// Manual rail (e-Transfer/cash): initiate just echoes the admin-configured instructions +
// payee, using the order's public id as the human-friendly reference the customer includes.
export class ManualProvider implements PaymentProvider {
  readonly kind = "manual" as const;
  constructor(readonly id: string) {}

  initiate(input: InitiateInput): InitiateResult {
    return {
      kind: "manual_instructions",
      instructions: input.method.instructions ?? "",
      payeeHandle: input.method.payeeHandle ?? "",
      reference: input.orderRef,
    };
  }
}

export function providerFor(method: PaymentMethodConfig): PaymentProvider {
  switch (method.kind) {
    case "manual":
      return new ManualProvider(method.id);
    case "online":
      throw new Error("Online payment providers are not implemented yet");
    default: {
      const _exhaustive: never = method.kind;
      throw new Error(`Unknown payment method kind: ${String(_exhaustive)}`);
    }
  }
}
```

```ts
// packages/payments/src/index.ts
export * from "./config";
export * from "./tax";
export * from "./provider";
export * from "./manual";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @realm/payments test`
Expected: PASS (config + tax + manual).

- [ ] **Step 5: Commit**

```bash
git add packages/payments
git commit -m "feat(payments): PaymentProvider contract + manual e-Transfer adapter"
```

---

### Task 4: Lifecycle vocabulary + predicates

**Files:**
- Create: `packages/payments/src/lifecycle.ts`
- Modify: `packages/payments/src/index.ts` (add `export * from "./lifecycle";`)
- Test: `packages/payments/src/__tests__/lifecycle.test.ts`

**Interfaces:**
- Produces: `PaymentLifecycle = "awaiting_payment" | "pending_verification" | "paid" | "rejected" | "refunded"`; `canClaim(status): boolean`; `canVerify(status): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/payments/src/__tests__/lifecycle.test.ts
import { describe, it, expect } from "vitest";
import { canClaim, canVerify, type PaymentLifecycle } from "../index";

describe("lifecycle predicates", () => {
  it("canClaim is true only for awaiting_payment or rejected", () => {
    const claimable: PaymentLifecycle[] = ["awaiting_payment", "rejected"];
    const notClaimable: PaymentLifecycle[] = ["pending_verification", "paid", "refunded"];
    for (const s of claimable) expect(canClaim(s)).toBe(true);
    for (const s of notClaimable) expect(canClaim(s)).toBe(false);
  });
  it("canVerify is true only for pending_verification", () => {
    expect(canVerify("pending_verification")).toBe(true);
    expect(canVerify("awaiting_payment")).toBe(false);
    expect(canVerify("paid")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @realm/payments test lifecycle`
Expected: FAIL — `canClaim` / `canVerify` not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/payments/src/lifecycle.ts
// Canonical statuses the package reasons about; apps map these onto their own payments enum.
export type PaymentLifecycle =
  | "awaiting_payment"
  | "pending_verification"
  | "paid"
  | "rejected"
  | "refunded";

// A customer may (re)submit a claim while the order is unpaid or after a rejection.
export function canClaim(status: PaymentLifecycle): boolean {
  return status === "awaiting_payment" || status === "rejected";
}

// Staff may verify only a submitted-but-unconfirmed claim.
export function canVerify(status: PaymentLifecycle): boolean {
  return status === "pending_verification";
}
```

```ts
// packages/payments/src/index.ts
export * from "./config";
export * from "./tax";
export * from "./provider";
export * from "./manual";
export * from "./lifecycle";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @realm/payments test && pnpm --filter @realm/payments typecheck`
Expected: PASS (all suites) and typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/payments
git commit -m "feat(payments): payment lifecycle vocabulary + predicates"
```

---

## Roadmap (subsequent plans, each its own doc)

- **P1** — tiffin-grab persistence (`app.payment_config` + `get/setPaymentConfig`) + admin `/dashboard/settings/payments` page.
- **P2** — method-aware server pricing (per-method taxes + method-gated coupons) + checkout method step + order/payment `awaiting_payment` creation + ledger-credit deferral.
- **P3** — customer claim (reference + photo) at checkout success and in Finances/Bills.
- **P4** — staff verify/reject in dashboard + ledger credit on verify.
- **P5 (later)** — Stripe online adapter + webhook confirmation.

## Self-Review

- **Spec coverage (P0 slice):** config schema (§2.1) → Task 1; tax math (§2.2) → Task 2; provider + manual adapter (§2.3) → Task 3; lifecycle (§2.4) → Task 4; package tests (§2.5) → all tasks. Persistence/UI/pricing (§3–§7) are explicitly deferred to P1–P5.
- **Placeholder scan:** none — every step has full code + exact commands.
- **Type consistency:** `PaymentMethodConfig`/`PaymentConfig`/`TaxLine` defined in Task 1 and reused verbatim in Tasks 2–3; `InitiateResult.kind` values match `providerFor` switch; `PaymentLifecycle` strings match the spec's canonical set.
