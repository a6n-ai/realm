# Plugin Contract, Payments-as-Plugin, and Google Reviews — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Realm a real plugin contract in `@realm/crm`, model Payments as one plugin containing providers, and add a `@realm/google-reviews` plugin that shows real Google reviews publicly and nudges customers to leave one.

**Architecture:** `@realm/crm` owns a two-half plugin contract — `PluginMeta` (client-safe, carries the `LucideIcon`) and `PluginServer` (server-only, carries `install`/`uninstall`/`status`). The split is forced by React Server Components: an icon is a function and cannot cross the server→client props boundary. Each app composes its own registry array, so tiffin-grab simply never imports `@realm/clover` — absence is the gating. Plugin config rides the existing `integrations_config` JSONB column, whose zod schema is `.loose()`, so no migration is needed for configuration.

**Tech Stack:** TypeScript, Next.js 16 (App Router, RSC), React 19, zod 4, Drizzle ORM + PostgreSQL, vitest 4, pnpm + Turborepo, lucide-react, sonner, AWS SES via `@realm/email`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-08-plugin-system-payments-google-reviews-design.md`.
- **Never rewrite an applied migration.** Every migration here is additive (`AGENTS.md`).
- **No DB rebuild.** Both apps are in production with real orders and payments.
- Packages ship raw `.ts`/`.tsx` — no build step. Client-consumed packages MUST be listed in each app's `next.config.ts` `transpilePackages`.
- Layering is acyclic: `commons`/`themes` floor → `ui` → `design-system` → `crm`/`crm-core`. Lower layers never import up. **No package ever imports an app.**
- Server Actions must **return** errors, never throw — a thrown error becomes a digest-only crash with no usable message.
- Audit fields are stamped from the session, never from input.
- Pricing/totals are computed server-side only.
- `docs/` is listed in `.gitignore:63` but every existing spec/plan under `docs/superpowers/` is tracked. Committing files there requires `git add -f`.
- Verify contract after each task: `pnpm turbo typecheck && pnpm turbo test`.
- Two things `tsc` cannot catch — check by eye on every client component touched: (1) a stripped or missing `"use client"` directive, (2) a client symbol demoted from a named export (the `Component.Skeleton` trap).
- Commit after every task.

## File Structure

**New in `@realm/crm`:**
| File | Responsibility |
|---|---|
| `packages/crm/src/plugin.ts` | `PluginMeta`, `PluginNavItem`, `PluginNavSection` — client-safe types only |
| `packages/crm/src/plugin.server.ts` | `PluginStatus`, `PluginServer`, `PluginRegistry`, `resolveStatuses`, `blockedBy`, `dependents` |
| `packages/crm/src/plugin-catalog.tsx` | `PluginCatalog` client component — maps metas × statuses onto `IntegrationPluginCard` |
| `packages/crm/src/__tests__/plugin.server.test.ts` | Pure unit tests for the three registry functions |
| `packages/crm/vitest.config.ts` | Test runner config (package has none today) |

**New in `@realm/payments`:**
| File | Responsibility |
|---|---|
| `packages/payments/src/providers.ts` | `PaymentProviderDef`, `PAYMENT_PROVIDERS`, `findPaymentProvider` — moved out of tiffin-grab |
| `packages/payments/src/__tests__/providers.test.ts` | Seed-shape regression tests |

**New package `@realm/google-reviews`:**
| File | Responsibility |
|---|---|
| `packages/google-reviews/package.json` | Manifest, 3 entrypoints (`.`, `./plugin`, `./ui`) |
| `packages/google-reviews/tsconfig.json` | Extends base |
| `packages/google-reviews/vitest.config.ts` | Test runner config |
| `packages/google-reviews/src/plugin.ts` | `GOOGLE_REVIEWS_PLUGIN_ID`, `GOOGLE_REVIEWS_PLUGIN` meta |
| `packages/google-reviews/src/config.ts` | zod config schema, parse/defaults, env key loader |
| `packages/google-reviews/src/types.ts` | `Review`, `ReviewsSummary`, `ReviewsProvider` |
| `packages/google-reviews/src/places-provider.ts` | Places API implementation + response mapper |
| `packages/google-reviews/src/store.ts` | `getGoogleReviewsConfig` / `setGoogleReviews*` over the injected store |
| `packages/google-reviews/src/summary.ts` | `getReviewsSummary` — provider selection + fetch cache |
| `packages/google-reviews/src/nudge.ts` | `ReviewNudgeStore` port, `shouldNudge`, `writeReviewUrl` |
| `packages/google-reviews/src/index.ts` | Server barrel |
| `packages/google-reviews/src/ui/index.ts` | Client barrel |
| `packages/google-reviews/src/ui/google-reviews-card.tsx` | Integrations catalog card |
| `packages/google-reviews/src/ui/google-reviews-settings-panel.tsx` | Settings form (place id + test) |
| `packages/google-reviews/src/__tests__/*.test.ts` | Provider mapping, config parse, nudge eligibility |

**Per-app (both apps unless noted):**
| File | Responsibility |
|---|---|
| `apps/<app>/lib/plugins.server.ts` | The app's registry array |
| `apps/<app>/app/(dashboard)/dashboard/settings/integrations/actions.ts` | Generic `setPluginInstalledAction` |
| `apps/<app>/app/(dashboard)/dashboard/settings/integrations/plugins-catalog.tsx` | Rewritten to use `PluginCatalog` |
| `apps/<app>/db/schema/review-nudges.ts` | `review_nudges` table |
| `apps/<app>/lib/services/review-nudge.service.ts` | `ReviewNudgeStore` implementation |

---

### Task 1: Plugin contract in `@realm/crm`

**Files:**
- Create: `packages/crm/src/plugin.ts`
- Create: `packages/crm/src/plugin.server.ts`
- Create: `packages/crm/src/plugin-catalog.tsx`
- Create: `packages/crm/vitest.config.ts`
- Test: `packages/crm/src/__tests__/plugin.server.test.ts`
- Modify: `packages/crm/package.json`, `packages/crm/src/index.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `PluginMeta`, `PluginNavItem`, `PluginNavSection`, `PluginCatalog` from `@realm/crm`; `PluginStatus`, `PluginServer`, `PluginRegistry`, `resolveStatuses`, `blockedBy`, `dependents` from `@realm/crm/server`.

- [ ] **Step 1: Add test tooling to the package**

`packages/crm/package.json` — add a `test` script and the vitest devDependency, and add the `./server` subpath export. Replace `"scripts"`, `"exports"` and `"devDependencies"` so the file reads:

```json
{
  "name": "@realm/crm",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./server": "./src/plugin.server.ts"
  },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": {
    "@realm/ui": "workspace:*",
    "lucide-react": "^1.20.0",
    "sonner": "^2.0.7"
  },
  "peerDependencies": { "react": "^19", "next": "16.2.9" },
  "devDependencies": {
    "@types/react": "^19",
    "next": "16.2.9",
    "react": "19.2.4",
    "typescript": "^5",
    "vitest": "^4.1.9"
  }
}
```

`next` and `sonner` are new here: `plugin-catalog.tsx` imports `next/link`, `next/navigation`, and `toast`. `@realm/clover` already declares `next` the same way (peer + dev), so this matches the existing convention rather than inventing one.

Create `packages/crm/vitest.config.ts` (identical to the one in `@realm/payments`):

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `packages/crm/src/__tests__/plugin.server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  resolveStatuses,
  blockedBy,
  dependents,
  type PluginRegistry,
  type PluginServer,
} from "../plugin.server";

function fake(id: string, installed: boolean, requires?: string[]): PluginServer {
  return {
    id,
    requires,
    status: async () => ({ installed }),
    install: async () => {},
    uninstall: async () => {},
  };
}

const registry: PluginRegistry = [
  fake("clover", true),
  fake("payments", false, ["clover"]),
  fake("google-reviews", false),
];

describe("resolveStatuses", () => {
  it("returns a status keyed by plugin id", async () => {
    expect(await resolveStatuses(registry)).toEqual({
      clover: { installed: true },
      payments: { installed: false },
      "google-reviews": { installed: false },
    });
  });
});

describe("blockedBy", () => {
  it("is empty when the plugin declares no requirements", async () => {
    const s = await resolveStatuses(registry);
    expect(blockedBy(registry, "google-reviews", s)).toEqual([]);
  });

  it("is empty when every requirement is installed", async () => {
    const s = await resolveStatuses(registry);
    expect(blockedBy(registry, "payments", s)).toEqual([]);
  });

  it("names each uninstalled requirement", async () => {
    const s = { clover: { installed: false }, payments: { installed: false } };
    expect(blockedBy(registry, "payments", s)).toEqual(["clover"]);
  });

  it("treats an unknown plugin id as unblocked", async () => {
    expect(blockedBy(registry, "nope", {})).toEqual([]);
  });
});

describe("dependents", () => {
  it("names plugins that require the given plugin", () => {
    expect(dependents(registry, "clover")).toEqual(["payments"]);
  });

  it("is empty when nothing requires it", () => {
    expect(dependents(registry, "payments")).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @realm/crm test`
Expected: FAIL — `Failed to resolve import "../plugin.server"`.

- [ ] **Step 4: Write the client-safe half**

Create `packages/crm/src/plugin.ts`:

```ts
import type { LucideIcon } from "lucide-react";

/**
 * Client-safe plugin catalog metadata. Imported directly by client components —
 * `icon` is a function and cannot cross the RSC server→client props boundary,
 * which is why install/uninstall live in `plugin.server.ts` instead.
 */
export type PluginMeta = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Settings route revealed once installed. */
  settingsHref?: string;
};

export type PluginNavItem = { title: string; href: string; icon: LucideIcon };
export type PluginNavSection = { label: string; items: PluginNavItem[] };
```

- [ ] **Step 5: Write the server half**

Create `packages/crm/src/plugin.server.ts`:

```ts
import type { PluginNavSection } from "./plugin";

export type PluginStatus = {
  installed: boolean;
  /** e.g. "Installed" / "Connected" — shown on the catalog card. */
  statusLabel?: string;
};

export type PluginServer = {
  id: string;
  status(): Promise<PluginStatus>;
  install(): Promise<void>;
  uninstall(): Promise<void>;
  /** Plugin ids that must be installed before this one can be. */
  requires?: string[];
  /** Nav this plugin contributes when installed. */
  nav?(status: PluginStatus): PluginNavSection[];
};

export type PluginRegistry = readonly PluginServer[];

export async function resolveStatuses(
  registry: PluginRegistry,
): Promise<Record<string, PluginStatus>> {
  const entries = await Promise.all(
    registry.map(async (p) => [p.id, await p.status()] as const),
  );
  return Object.fromEntries(entries);
}

/** Forward check: which of this plugin's requirements are not installed. */
export function blockedBy(
  registry: PluginRegistry,
  id: string,
  statuses: Record<string, PluginStatus>,
): string[] {
  const plugin = registry.find((p) => p.id === id);
  if (!plugin?.requires) return [];
  return plugin.requires.filter((req) => !statuses[req]?.installed);
}

/**
 * Backward check: which plugins would break if this one were uninstalled.
 * Without this an admin can revoke Clover and leave a payment provider
 * pointing at dead tokens — which fails at charge time, in front of a customer.
 */
export function dependents(registry: PluginRegistry, id: string): string[] {
  return registry.filter((p) => p.requires?.includes(id)).map((p) => p.id);
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @realm/crm test`
Expected: PASS — 7 tests.

- [ ] **Step 7: Write the catalog client component**

Create `packages/crm/src/plugin-catalog.tsx`:

```tsx
"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { IntegrationPluginCard, IntegrationPluginCardSkeleton } from "./integration-plugin-card";
import type { PluginMeta } from "./plugin";

/** Plain-JSON mirror of PluginStatus — safe to pass server→client. */
export type PluginCatalogStatus = { installed: boolean; statusLabel?: string };

export type SetPluginInstalled = (
  id: string,
  installed: boolean,
) => Promise<{ error?: string }>;

export function PluginCatalog({
  metas,
  statuses,
  setInstalled,
  slots,
}: {
  metas: readonly PluginMeta[];
  statuses: Record<string, PluginCatalogStatus>;
  setInstalled: SetPluginInstalled;
  /** Plugins that render their own card body instead of the default buttons. */
  slots?: Record<string, ReactNode>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {metas.map((meta) => {
        const custom = slots?.[meta.id];
        if (custom) return <div key={meta.id}>{custom}</div>;
        return (
          <PluginCard
            key={meta.id}
            meta={meta}
            status={statuses[meta.id] ?? { installed: false }}
            setInstalled={setInstalled}
          />
        );
      })}
    </div>
  );
}

function PluginCard({
  meta,
  status,
  setInstalled,
}: {
  meta: PluginMeta;
  status: PluginCatalogStatus;
  setInstalled: SetPluginInstalled;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const run = (installed: boolean, ok: string) =>
    start(async () => {
      const res = await setInstalled(meta.id, installed);
      if (res?.error) {
        toast.error(res.error);
        return;
      }
      toast.success(ok);
      router.refresh();
    });

  return (
    <IntegrationPluginCard
      icon={<meta.icon className="size-5" />}
      label={meta.label}
      description={meta.description}
      statusLabel={status.installed ? (status.statusLabel ?? "Installed") : null}
    >
      {!status.installed ? (
        <Button
          type="button"
          size="sm"
          className="gap-1.5 self-start"
          disabled={pending}
          onClick={() => run(true, `${meta.label} installed`)}
        >
          <PlusIcon className="size-3.5" />
          Add plugin
        </Button>
      ) : (
        <>
          {meta.settingsHref ? (
            <Button asChild type="button" size="sm" variant="outline" className="gap-1.5 self-start">
              <Link href={meta.settingsHref}>
                <SettingsIcon className="size-3.5" />
                Configure
              </Link>
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 self-start text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => run(false, `${meta.label} removed`)}
          >
            <Trash2Icon className="size-3.5" />
            Remove
          </Button>
        </>
      )}
    </IntegrationPluginCard>
  );
}

export function PluginCatalogSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <IntegrationPluginCardSkeleton key={i} />
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Export the new surface**

Replace `packages/crm/src/index.ts` with:

```ts
export { CrmShell } from "./crm-shell";
export {
  IntegrationPluginCard,
  IntegrationPluginCardSkeleton,
} from "./integration-plugin-card";
export type { PluginMeta, PluginNavItem, PluginNavSection } from "./plugin";
export {
  PluginCatalog,
  PluginCatalogSkeleton,
  type PluginCatalogStatus,
  type SetPluginInstalled,
} from "./plugin-catalog";
```

- [ ] **Step 9: Verify by eye (tsc cannot catch these)**

1. `packages/crm/src/plugin-catalog.tsx` line 1 is exactly `"use client";`.
2. `PluginCatalog` **and** `PluginCatalogSkeleton` are both named exports in `index.ts` — a skeleton demoted to a property is the `Component.Skeleton` trap.

- [ ] **Step 10: Run the full verify contract**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/crm
git commit -m "feat(crm): add plugin contract, registry helpers, and catalog component"
```

---

### Task 2: Move the payment catalog into `@realm/payments` as providers

**Files:**
- Create: `packages/payments/src/providers.ts`
- Test: `packages/payments/src/__tests__/providers.test.ts`
- Modify: `packages/payments/src/index.ts`, `packages/payments/package.json`

**Interfaces:**
- Consumes: `PaymentMethodConfig` from `packages/payments/src/config.ts`.
- Produces: `PaymentProviderDef`, `PAYMENT_PROVIDERS`, `findPaymentProvider` from `@realm/payments`.

- [ ] **Step 1: Write the failing test**

The seeds must stay byte-identical to today's `PAYMENT_PLUGIN_CATALOG`, because they are written into live `payment_config`. Create `packages/payments/src/__tests__/providers.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { PAYMENT_PROVIDERS, findPaymentProvider } from "../providers";

describe("PAYMENT_PROVIDERS", () => {
  it("ships exactly the three manual providers, in order", () => {
    expect(PAYMENT_PROVIDERS.map((p) => p.id)).toEqual(["etransfer", "cash", "manual"]);
  });

  it("seeds etransfer identically to the pre-move catalog", () => {
    expect(findPaymentProvider("etransfer")!.seed()).toEqual({
      id: "etransfer",
      kind: "manual",
      enabled: false,
      label: "Interac e-Transfer",
      taxes: [],
    });
  });

  it("seeds cash identically to the pre-move catalog", () => {
    expect(findPaymentProvider("cash")!.seed()).toEqual({
      id: "cash",
      kind: "manual",
      enabled: false,
      label: "Cash on delivery",
      taxes: [],
    });
  });

  it("seeds manual identically to the pre-move catalog", () => {
    expect(findPaymentProvider("manual")!.seed()).toEqual({
      id: "manual",
      kind: "manual",
      enabled: false,
      label: "Manual / Other",
      taxes: [],
    });
  });

  it("returns undefined for an unknown provider", () => {
    expect(findPaymentProvider("stripe")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/payments test`
Expected: FAIL — `Failed to resolve import "../providers"`.

- [ ] **Step 3: Create the providers module**

Create `packages/payments/src/providers.ts` — this is `apps/tiffin-grab/app/(dashboard)/dashboard/settings/integrations/registry.ts` moved into the package, with `requiresPlugin` added:

```ts
import type { LucideIcon } from "lucide-react";
import { BanknoteIcon, CreditCardIcon, HandCoinsIcon } from "lucide-react";
import type { PaymentMethodConfig } from "./config";

/**
 * A payment provider inside the Payments plugin (Settings → Payments).
 * Providers are NOT Integrations cards — Payments is the single plugin.
 */
export type PaymentProviderDef = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /**
   * Plugin id that must be installed for this provider to be available,
   * e.g. "clover" for the Clover Payment provider. Unused by the three
   * manual providers; first consumer lands with Clover Payment.
   */
  requiresPlugin?: string;
  /** Seed row written into payment_config when the provider is installed. */
  seed: () => PaymentMethodConfig;
};

export const PAYMENT_PROVIDERS: readonly PaymentProviderDef[] = [
  {
    id: "etransfer",
    label: "Interac e-Transfer",
    description: "Customers send an e-Transfer; staff verifies the claim.",
    icon: BanknoteIcon,
    seed: () => ({
      id: "etransfer",
      kind: "manual",
      enabled: false,
      label: "Interac e-Transfer",
      taxes: [],
    }),
  },
  {
    id: "cash",
    label: "Cash on delivery",
    description: "Collect cash at the door; optional photo proof on claim.",
    icon: HandCoinsIcon,
    seed: () => ({
      id: "cash",
      kind: "manual",
      enabled: false,
      label: "Cash on delivery",
      taxes: [],
    }),
  },
  {
    id: "manual",
    label: "Manual / Other",
    description: "Custom instructions for bank transfer, cheque, etc.",
    icon: CreditCardIcon,
    seed: () => ({
      id: "manual",
      kind: "manual",
      enabled: false,
      label: "Manual / Other",
      taxes: [],
    }),
  },
];

export function findPaymentProvider(id: string): PaymentProviderDef | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}
```

- [ ] **Step 4: Export it and add the icon dependency**

Append to `packages/payments/src/index.ts`:

```ts
export * from "./providers";
```

`packages/payments/package.json` — add `lucide-react` to `dependencies`, since `providers.ts` imports icons:

```json
"dependencies": { "lucide-react": "^1.20.0", "zod": "^4.4.3" }
```

Run: `pnpm install`

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @realm/payments test`
Expected: PASS — 5 new tests, plus the existing suites still green.

- [ ] **Step 6: Commit**

```bash
git add packages/payments
git commit -m "feat(payments): move the payment catalog into the package as providers"
```

---

### Task 3: Payments becomes one plugin

**Modularity ruling (binding):** the plugin adapter lives in `@realm/payments`, **not** in the app. The package never imports an app — every app-specific thing (both config stores) is injected, exactly like `@realm/clover`'s existing `IntegrationsConfigStore`. The app's only job is to call `paymentsPlugin({...})` with its own stores.

**Files:**
- Create: `packages/payments/src/plugin.ts` (client-safe meta)
- Create: `packages/payments/src/plugin.server.ts` (adapter)
- Test: `packages/payments/src/__tests__/plugin.server.test.ts`
- Modify: `packages/payments/package.json` (add `@realm/crm` dep, `./plugin` + `./server` exports)
- Create: `apps/tiffin-grab/lib/plugins.ts`, `apps/tiffin-grab/lib/plugins.server.ts`
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/settings/payments/actions.ts`
- Delete: `apps/tiffin-grab/app/(dashboard)/dashboard/settings/integrations/registry.ts`

**Interfaces:**
- Consumes: `PluginServer` / `PluginRegistry` from `@realm/crm/server` (Task 1); `PAYMENT_PROVIDERS`, `findPaymentProvider` from `@realm/payments` (Task 2); `getPaymentConfig`, `setPaymentConfig`, `getIntegrationsConfig`, `setIntegrationsConfig` from `apps/tiffin-grab/lib/services/app-settings.service.ts`.
- Produces: `PAYMENTS_PLUGIN_ID`, `PAYMENTS_PLUGIN` from `@realm/payments/plugin`; `paymentsInstalledFrom`, `paymentsPlugin(deps)`, `PaymentsPluginDeps` from `@realm/payments/server`; `PLUGINS` / `PLUGIN_METAS` from the tiffin-grab registry files.

- [ ] **Step 1: Write the failing test for install-state backfill**

Create `packages/payments/src/__tests__/plugin.server.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { paymentsInstalledFrom } from "../plugin.server";

describe("paymentsInstalledFrom", () => {
  it("is true when the explicit flag is set", () => {
    expect(paymentsInstalledFrom({ installed: true }, { methods: [] })).toBe(true);
  });

  it("is false when the explicit flag is unset, even with methods present", () => {
    expect(
      paymentsInstalledFrom(
        { installed: false },
        { methods: [{ id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] }] },
      ),
    ).toBe(false);
  });

  it("backfills to true from existing methods when no flag was ever written", () => {
    expect(
      paymentsInstalledFrom(undefined, {
        methods: [{ id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] }],
      }),
    ).toBe(true);
  });

  it("backfills to false when there is neither a flag nor any method", () => {
    expect(paymentsInstalledFrom(undefined, { methods: [] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/payments test -- plugin.server`
Expected: FAIL — cannot resolve `../plugin.server`.

- [ ] **Step 3: Write the client-safe meta**

Create `packages/payments/src/plugin.ts`:

```ts
import { CreditCardIcon } from "lucide-react";
import type { PluginMeta } from "@realm/crm";

export const PAYMENTS_PLUGIN_ID = "payments" as const;

/** Client-safe catalog metadata. No secrets, no fetch, no store. */
export const PAYMENTS_PLUGIN: PluginMeta = {
  id: PAYMENTS_PLUGIN_ID,
  label: "Payments",
  description:
    "Accept payments. Configure providers — e-Transfer, cash, manual — under Settings → Payment.",
  icon: CreditCardIcon,
  settingsHref: "/dashboard/settings/payments",
};
```

- [ ] **Step 4: Write the adapter with injected stores**

Create `packages/payments/src/plugin.server.ts`. **Both stores are injected** — this package must never import an app:

```ts
import type { PluginServer, PluginStatus } from "@realm/crm/server";
import type { PaymentConfig } from "./config";
import { PAYMENTS_PLUGIN_ID } from "./plugin";

/**
 * App-injected persistence. Mirrors @realm/clover's IntegrationsConfigStore:
 * the package never imports an app or a DB client.
 *
 * `integrations` is the shared plugin blob (JSONB on the tenant row);
 * `payments` is the separate payment_config blob holding provider rows.
 */
export type PaymentsPluginDeps = {
  integrations: {
    get(): Promise<Record<string, unknown>>;
    set(cfg: Record<string, unknown>): Promise<void>;
  };
  payments: {
    get(): Promise<PaymentConfig>;
  };
};

type PaymentsPluginConfig = { installed: boolean } | undefined;

/**
 * Install state, with a read-time backfill so existing production tenants
 * report installed without a data migration: a tenant that already has payment
 * methods configured has, by definition, installed Payments.
 */
export function paymentsInstalledFrom(
  cfg: PaymentsPluginConfig,
  payments: Pick<PaymentConfig, "methods">,
): boolean {
  if (cfg) return cfg.installed;
  return payments.methods.length > 0;
}

export function paymentsPlugin(deps: PaymentsPluginDeps): PluginServer {
  const setInstalled = async (installed: boolean): Promise<void> => {
    const cfg = await deps.integrations.get();
    await deps.integrations.set({ ...cfg, [PAYMENTS_PLUGIN_ID]: { installed } });
  };

  return {
    id: PAYMENTS_PLUGIN_ID,

    async status(): Promise<PluginStatus> {
      const [integrations, payments] = await Promise.all([
        deps.integrations.get(),
        deps.payments.get(),
      ]);
      const cfg = integrations[PAYMENTS_PLUGIN_ID] as PaymentsPluginConfig;
      const installed = paymentsInstalledFrom(cfg, payments);
      const n = payments.methods.length;
      return {
        installed,
        statusLabel: installed ? `Installed · ${n} provider${n === 1 ? "" : "s"}` : undefined,
      };
    },

    install: () => setInstalled(true),

    // Providers and their tax/payee config stay in payment_config untouched —
    // uninstalling hides the Payment settings surface, it does not destroy
    // money configuration. Reinstalling restores exactly what was there.
    uninstall: () => setInstalled(false),
  };
}
```

Add to `packages/payments/package.json`: `"@realm/crm": "workspace:*"` in `dependencies`, and extend `exports`:

```json
"exports": {
  ".": "./src/index.ts",
  "./plugin": "./src/plugin.ts",
  "./server": "./src/plugin.server.ts"
}
```

Do **not** re-export `plugin.server.ts` from `src/index.ts` — keeping it on its own subpath is what stops a client component pulling it in.

Run: `pnpm install`

- [ ] **Step 5: Extend the test for the injected-store behaviour**

Append to `packages/payments/src/__tests__/plugin.server.test.ts`:

```ts
import { paymentsPlugin } from "../plugin.server";

function deps(integrations: Record<string, unknown> = {}, methods: PaymentConfig["methods"] = []) {
  let cfg = { ...integrations };
  return {
    store: {
      integrations: {
        get: async () => cfg,
        set: async (next: Record<string, unknown>) => {
          cfg = next;
        },
      },
      payments: { get: async () => ({ methods }) as PaymentConfig },
    },
    raw: () => cfg,
  };
}

describe("paymentsPlugin", () => {
  it("install sets the flag without clobbering another plugin's key", async () => {
    const d = deps({ clover: { installed: true } });
    await paymentsPlugin(d.store).install();
    expect(d.raw()).toEqual({ clover: { installed: true }, payments: { installed: true } });
  });

  it("uninstall clears the flag and leaves payment methods alone", async () => {
    const d = deps({ payments: { installed: true } }, [
      { id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] },
    ]);
    await paymentsPlugin(d.store).uninstall();
    expect(d.raw()).toEqual({ payments: { installed: false } });
    expect(await paymentsPlugin(d.store).status()).toEqual({ installed: false });
  });

  it("status counts providers when installed", async () => {
    const d = deps({ payments: { installed: true } }, [
      { id: "cash", kind: "manual", enabled: false, label: "Cash", taxes: [] },
    ]);
    expect(await paymentsPlugin(d.store).status()).toEqual({
      installed: true,
      statusLabel: "Installed · 1 provider",
    });
  });
});
```

Add `import type { PaymentConfig } from "../config";` to the test's imports.

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @realm/payments test`
Expected: PASS — 7 new tests plus the existing suites.

- [ ] **Step 7: Repoint the payment actions at the package**

In `apps/tiffin-grab/app/(dashboard)/dashboard/settings/payments/actions.ts`, replace the import on line 8:

```ts
import { findPaymentPlugin } from "../integrations/registry";
```

with:

```ts
import { findPaymentProvider } from "@realm/payments";
```

Then replace both call sites (lines 39 and 54) — `findPaymentPlugin(pluginId)` becomes `findPaymentProvider(pluginId)`. Behaviour is otherwise unchanged: same seeds, same `revalidatePath` calls, same `ValidationError` messages.

Delete the now-unused file:

```bash
git rm apps/tiffin-grab/app/\(dashboard\)/dashboard/settings/integrations/registry.ts
```

- [ ] **Step 8: Create the app registry**

Two files, deliberately split so a client component can never reach the DB by importing the wrong one. Note how thin the app side now is — the app supplies stores, nothing else.

Create `apps/tiffin-grab/lib/plugins.ts` — **client-safe**, types and icons only:

```ts
import type { PluginMeta } from "@realm/crm";
import { PAYMENTS_PLUGIN } from "@realm/payments/plugin";

/** Order here is the order cards render in. */
export const PLUGIN_METAS: readonly PluginMeta[] = [PAYMENTS_PLUGIN];
```

Create `apps/tiffin-grab/lib/plugins.server.ts` — **server-only**:

```ts
import type { PluginRegistry } from "@realm/crm/server";
import { paymentsPlugin } from "@realm/payments/server";
import {
  getIntegrationsConfig,
  setIntegrationsConfig,
  getPaymentConfig,
} from "@/lib/services/app-settings.service";

export const PLUGINS: PluginRegistry = [
  paymentsPlugin({
    integrations: { get: getIntegrationsConfig, set: setIntegrationsConfig },
    payments: { get: getPaymentConfig },
  }),
];
```

`getIntegrationsConfig` returns the typed `IntegrationsConfig`, which is structurally compatible with the `Record<string, unknown>` the port expects because the schema is `.loose()`. If TypeScript objects to the `set` direction, cast at the injection site here — in the app, never inside the package.

Clover is added to both files in Task 4 and Google Reviews in Task 6.

- [ ] **Step 9: Gate the settings hub entries**

Restored: this step implements the spec's Section 2 requirement that "providers are enabled under Settings → Payments, which appears once the Payments plugin is installed". It was dropped in error during a plan amendment.

In `apps/tiffin-grab/app/(dashboard)/dashboard/settings/page.tsx`, change the `integrations` section description to:

```ts
description: "Install and remove plugins (Payments, Clover, and more).",
```

Then gate the `payments` section on install status, mirroring the existing `clover.installed` block. Replace the static `payments` entry in the `sections` array with a conditional push after it:

```ts
const paymentsStatus = await PLUGINS.find((p) => p.id === PAYMENTS_PLUGIN_ID)?.status();
if (paymentsStatus?.installed) {
  sections.push({
    key: "payments",
    label: "Payment",
    description: "Configure installed payment providers — taxes, payee, and enablement.",
    icon: CreditCardIcon,
    href: "/dashboard/settings/payments",
  });
}
```

The backfill from Step 4 is what makes this safe on live data: an existing tenant with configured methods reports installed, so the card does not vanish for them.

- [ ] **Step 10: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

If the full turbo run hangs, these scoped commands cover this task's blast radius:

```bash
pnpm --filter @realm/payments typecheck
pnpm --filter @realm/payments test
pnpm --filter @realm/crm test
pnpm --filter tiffin-grab typecheck
```

- [ ] **Step 11: Commit**

```bash
git add -A packages/payments apps/tiffin-grab pnpm-lock.yaml
git commit -m "feat(payments): model payments as a single plugin with injected stores"
```

---

### Task 4: Clover onto the contract, and both Integrations pages rewritten

**Modularity ruling (binding):** the Clover adapter lives in `@realm/clover`, written **once**, not copied into each app. This task also moves `IntegrationsConfigStore` down into `@realm/crm/server` so plugin packages share one port instead of each importing `@realm/clover` for a type; `@realm/clover` re-exports it so nothing existing breaks.

**Files:**
- Create: `packages/crm/src/config-store.ts` (the shared port, re-exported from `@realm/crm/server`)
- Modify: `packages/clover/src/store.ts` (re-export the port from `@realm/crm/server` instead of declaring it)
- Create: `packages/clover/src/plugin.server.ts` (the adapter)
- Modify: `packages/clover/package.json` (add `./server` export)
- Create: `apps/puchkaman/lib/plugins.ts`, `apps/puchkaman/lib/plugins.server.ts`
- Modify: `apps/tiffin-grab/lib/plugins.ts`, `apps/tiffin-grab/lib/plugins.server.ts`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/integrations/actions.ts`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/integrations/page.tsx`
- Modify: `apps/puchkaman/app/(dashboard)/dashboard/settings/integrations/plugins-catalog.tsx`
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/settings/integrations/page.tsx`
- Modify: `apps/tiffin-grab/app/(dashboard)/dashboard/settings/integrations/plugins-catalog.tsx`
- Create: `apps/tiffin-grab/app/(dashboard)/dashboard/settings/integrations/actions.ts`

**Interfaces:**
- Consumes: `PLUGINS`/`PLUGIN_METAS` (Task 3), `PluginCatalog`/`resolveStatuses`/`blockedBy` (Task 1), `@realm/clover` store functions.
- Produces: `cloverPlugin(store)` in each app; `setPluginInstalledAction(id, installed)` in each app's integrations `actions.ts`.

- [ ] **Step 1a: Move the config-store port into `@realm/crm`**

Create `packages/crm/src/config-store.ts`:

```ts
/**
 * App-injected persistence for the shared plugin config blob (JSONB on the
 * tenant row). Every plugin package takes this; none imports an app or a DB.
 * `.loose()` parsing on the app side is what lets plugins coexist in one blob.
 */
export type IntegrationsConfigStore<T = Record<string, unknown>> = {
  get(): Promise<T>;
  set(cfg: T): Promise<void>;
};
```

Re-export it from `packages/crm/src/plugin.server.ts`:

```ts
export type { IntegrationsConfigStore } from "./config-store";
```

In `packages/clover/src/store.ts`, delete the local `IntegrationsConfigStore` declaration and replace it with a re-export, so every existing `import { type IntegrationsConfigStore } from "@realm/clover"` keeps working:

```ts
import type { IntegrationsConfigStore as BaseStore } from "@realm/crm/server";
import type { IntegrationsConfig } from "./config";

export type IntegrationsConfigStore = BaseStore<IntegrationsConfig>;
```

- [ ] **Step 1b: Write the Clover adapter — once, in the package**

Create `packages/clover/src/plugin.server.ts`:

```ts
import { CreditCardIcon } from "lucide-react";
import type { PluginMeta, PluginNavSection } from "@realm/crm";
import type { PluginServer, PluginStatus } from "@realm/crm/server";
import { CLOVER_PLUGIN } from "./plugin";
import { getCloverConnection, installCloverPlugin, uninstallCloverPlugin } from "./store";
import type { IntegrationsConfigStore } from "./store";

export const CLOVER_PLUGIN_META: PluginMeta = {
  id: CLOVER_PLUGIN.id,
  label: CLOVER_PLUGIN.label,
  description: CLOVER_PLUGIN.description,
  icon: CreditCardIcon,
  settingsHref: "/dashboard/settings/clover",
};

export function cloverPlugin(store: IntegrationsConfigStore): PluginServer {
  return {
    id: CLOVER_PLUGIN.id,

    async status(): Promise<PluginStatus> {
      const conn = await getCloverConnection(store);
      return {
        installed: conn.installed,
        statusLabel: !conn.installed ? undefined : conn.connected ? "Connected" : "Installed",
      };
    },

    install: () => installCloverPlugin(store),
    uninstall: () => uninstallCloverPlugin(store),

    nav(status): PluginNavSection[] {
      if (!status.installed) return [];
      return [
        {
          label: "Clover",
          items: [
            { title: "Connection", href: "/dashboard/settings/clover", icon: CreditCardIcon },
          ],
        },
      ];
    },
  };
}
```

Add the `./server` entrypoint to `packages/clover/package.json`:

```json
"exports": {
  ".": "./src/index.ts",
  "./plugin": "./src/plugin.ts",
  "./server": "./src/plugin.server.ts",
  "./ui": "./src/ui/index.ts"
}
```

`CLOVER_PLUGIN_META` carries a `LucideIcon` and so must stay importable by client code; export it from `./plugin` as well by re-exporting there, or move the meta into `src/plugin.ts` and have `plugin.server.ts` import it. Either is fine — pick one and be consistent with what `@realm/payments` did in Task 3.

The existing `getNavSections` in `apps/puchkaman/components/dashboard/app-sidebar.tsx` is **not** changed in this task — it keeps its `cloverInstalled` prop and its own section building. `nav()` is wired up in a later, separate change; leaving the sidebar alone here keeps this task's blast radius to the Integrations page.

- [ ] **Step 2: Create the puchkaman registry**

Same two-file split as tiffin-grab. Note there is no per-app adapter file — the app only supplies its store.

Create `apps/puchkaman/lib/plugins.ts`:

```ts
import type { PluginMeta } from "@realm/crm";
import { CLOVER_PLUGIN_META } from "@realm/clover/plugin";

export const PLUGIN_METAS: readonly PluginMeta[] = [CLOVER_PLUGIN_META];
```

Create `apps/puchkaman/lib/plugins.server.ts`:

```ts
import type { PluginRegistry } from "@realm/crm/server";
import { cloverPlugin } from "@realm/clover/server";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

export const PLUGINS: PluginRegistry = [cloverPlugin(integrationsConfigStore)];
```

- [ ] **Step 3: Write the generic action (puchkaman)**

In `apps/puchkaman/app/(dashboard)/dashboard/settings/integrations/actions.ts`, **add** this action. Keep every existing Clover-specific action (`disconnectCloverAction`, `connectCloverApiTokenAction`, `startCloverConnectAction`) exactly as-is — they handle connection, not installation. Delete only `installCloverAction` and `uninstallCloverAction`, which this replaces.

```ts
import { blockedBy, resolveStatuses } from "@realm/crm/server";
import { PLUGINS } from "@/lib/plugins.server";

/**
 * Install/uninstall any plugin in the app registry.
 * Returns errors rather than throwing — a thrown Server Action error reaches
 * the client as an opaque digest with no usable message.
 */
export async function setPluginInstalledAction(
  id: string,
  installed: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const plugin = PLUGINS.find((p) => p.id === id);
  if (!plugin) return { error: "Unknown plugin" };

  const statuses = await resolveStatuses(PLUGINS);

  if (installed) {
    const missing = blockedBy(PLUGINS, id, statuses);
    if (missing.length) {
      return { error: `Install ${missing.join(", ")} first` };
    }
  }

  // The store write can fail (DB down, constraint). Returning the message keeps
  // the constraint above true end-to-end — an uncaught throw here would reach
  // the admin as an opaque digest with nothing actionable in it.
  try {
    installed ? await plugin.install() : await plugin.uninstall();
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not update plugin" };
  }

  await recordAudit({
    entity: "integrations",
    entityPublicId: id,
    operation: installed ? "create" : "delete",
    changes: { _action: installed ? `${id}_install` : `${id}_uninstall` },
    createdBy: await currentUserId(),
  });

  revalidateCloverPaths();
  return {};
}
```

`revalidateCloverPaths()` already revalidates `/dashboard/settings/integrations`, `/dashboard/settings/clover` and `/dashboard/settings` — all three are correct for any plugin here. Rename it to `revalidatePluginPaths` and update its three existing call sites in the same file.

- [ ] **Step 4: Rewrite the puchkaman catalog**

Replace `apps/puchkaman/app/(dashboard)/dashboard/settings/integrations/plugins-catalog.tsx` entirely:

```tsx
"use client";

import { PluginCatalog, PluginCatalogSkeleton, type PluginCatalogStatus } from "@realm/crm";
import { PLUGIN_METAS } from "@/lib/plugins";
import { setPluginInstalledAction } from "./actions";

export function PluginsCatalog({
  statuses,
}: {
  statuses: Record<string, PluginCatalogStatus>;
}) {
  return (
    <PluginCatalog
      metas={PLUGIN_METAS}
      statuses={statuses}
      setInstalled={setPluginInstalledAction}
    />
  );
}

export function PluginsCatalogSkeleton() {
  return <PluginCatalogSkeleton count={PLUGIN_METAS.length} />;
}
```

`PLUGIN_METAS` is a client-safe value (types + icons only), so importing it into a client component is correct. `PLUGINS` must **never** be imported here — it pulls in the DB.

- [ ] **Step 5: Update the puchkaman page loader**

Replace the loader in `apps/puchkaman/app/(dashboard)/dashboard/settings/integrations/page.tsx`:

```tsx
import { Suspense } from "react";
import { resolveStatuses } from "@realm/crm/server";
import { requireAdmin } from "@/lib/auth/guards";
import { PLUGINS } from "@/lib/plugins.server";
import { PluginsCatalog, PluginsCatalogSkeleton } from "./plugins-catalog";

export default async function IntegrationsPage() {
  await requireAdmin();
  return (
    <Suspense fallback={<PluginsCatalogSkeleton />}>
      <PluginsCatalogLoader />
    </Suspense>
  );
}

async function PluginsCatalogLoader() {
  const statuses = await resolveStatuses(PLUGINS);
  return <PluginsCatalog statuses={statuses} />;
}
```

`statuses` is plain JSON (`{ installed, statusLabel? }`), which is exactly what may cross the RSC boundary.

- [ ] **Step 6: Mirror all of the above in tiffin-grab**

No adapter file is created — `cloverPlugin` already exists in the package. Only the two registry files grow by one entry each:

```ts
// apps/tiffin-grab/lib/plugins.ts
import type { PluginMeta } from "@realm/crm";
import { PAYMENTS_PLUGIN } from "@realm/payments/plugin";
import { CLOVER_PLUGIN_META } from "@realm/clover/plugin";

export const PLUGIN_METAS: readonly PluginMeta[] = [PAYMENTS_PLUGIN, CLOVER_PLUGIN_META];
```

```ts
// apps/tiffin-grab/lib/plugins.server.ts
import type { PluginRegistry } from "@realm/crm/server";
import { cloverPlugin } from "@realm/clover/server";
import { paymentsPlugin } from "@realm/payments/server";
import {
  getIntegrationsConfig,
  setIntegrationsConfig,
  getPaymentConfig,
  integrationsConfigStore,
} from "@/lib/services/app-settings.service";

export const PLUGINS: PluginRegistry = [
  paymentsPlugin({
    integrations: { get: getIntegrationsConfig, set: setIntegrationsConfig },
    payments: { get: getPaymentConfig },
  }),
  cloverPlugin(integrationsConfigStore),
];
```

**This is the modularity payoff to check by eye:** adding a plugin to an app is now one line in each registry file. If this task leaves any per-app copy of an adapter behind, it has failed its ruling.

Create `apps/tiffin-grab/app/(dashboard)/dashboard/settings/integrations/actions.ts` with the same `setPluginInstalledAction` as Step 3, using tiffin-grab's `requireAdmin` from `@/lib/auth/guards`, its `recordAudit`/`currentUserId`, and revalidating `/dashboard/settings/integrations`, `/dashboard/settings/payments`, `/dashboard/settings/clover`, `/dashboard/settings`. **This is the bug fix noted in the spec** — tiffin-grab's Clover install/uninstall recorded no audit at all.

Delete `installCloverAction` and `uninstallCloverAction` from `apps/tiffin-grab/.../integrations/clover-actions.ts`, keeping the connect/disconnect actions.

Replace tiffin-grab's `plugins-catalog.tsx` and `page.tsx` with the same shape as Steps 4 and 5.

- [ ] **Step 7: Update the settings hub copy**

In `apps/tiffin-grab/app/(dashboard)/dashboard/settings/page.tsx`, the `integrations` section description says "payment methods, Clover, and more". Change it to:

```ts
description: "Install and remove plugins (Payments, Clover, and more).",
```

The `payments` section gating itself was already implemented in Task 3 Step 9 — leave it alone here. Do **not** call `paymentsPlugin()` with no arguments; since Task 3 it takes required injected stores, so resolve status through the app registry instead:

```ts
const paymentsStatus = await PLUGINS.find((p) => p.id === PAYMENTS_PLUGIN_ID)?.status();
if (paymentsStatus?.installed) {
  // …push the Payment section
}
```

- [ ] **Step 8: Verify by eye**

1. Both rewritten `plugins-catalog.tsx` files start with `"use client";`.
2. Neither imports `plugins.server.ts` — only `plugins.ts`.
3. `PluginsCatalog` and `PluginsCatalogSkeleton` remain named exports in both.

- [ ] **Step 9: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

Manual check (dev server, admin session, both apps): Settings → Integrations lists the expected cards; install and remove each one and confirm the status label flips and an audit row is written.

- [ ] **Step 10: Commit**

```bash
git add -A apps/puchkaman apps/tiffin-grab
git commit -m "feat(apps): drive Integrations from the shared plugin registry"
```

---

### Task 5: `@realm/google-reviews` package — config, types, Places provider

**Files:**
- Create: `packages/google-reviews/package.json`
- Create: `packages/google-reviews/tsconfig.json`
- Create: `packages/google-reviews/vitest.config.ts`
- Create: `packages/google-reviews/src/plugin.ts`
- Create: `packages/google-reviews/src/config.ts`
- Create: `packages/google-reviews/src/types.ts`
- Create: `packages/google-reviews/src/places-provider.ts`
- Create: `packages/google-reviews/src/index.ts`
- Test: `packages/google-reviews/src/__tests__/places-provider.test.ts`
- Test: `packages/google-reviews/src/__tests__/config.test.ts`

**Interfaces:**
- Consumes: `IntegrationsConfigStore` from `@realm/clover` (the port type; no Clover behaviour).
- Produces: `GOOGLE_REVIEWS_PLUGIN_ID`, `GOOGLE_REVIEWS_PLUGIN`, `googleReviewsConfigSchema`, `parseGoogleReviewsConfig`, `DEFAULT_GOOGLE_REVIEWS_CONFIG`, `loadPlacesApiKeyFromEnv`, `Review`, `ReviewsSummary`, `ReviewsProvider`, `mapPlaceDetails`, `placesProvider`.

- [ ] **Step 1: Scaffold the package**

Create `packages/google-reviews/package.json`:

```json
{
  "name": "@realm/google-reviews",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./plugin": "./src/plugin.ts",
    "./ui": "./src/ui/index.ts"
  },
  "types": "./src/index.ts",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@realm/clover": "workspace:*",
    "@realm/crm": "workspace:*",
    "@realm/ui": "workspace:*",
    "lucide-react": "^1.20.0",
    "sonner": "^2.0.7",
    "zod": "^4.4.3"
  },
  "peerDependencies": {
    "react": "^19",
    "next": "16.2.9"
  },
  "devDependencies": {
    "@types/react": "^19",
    "next": "16.2.9",
    "react": "19.2.4",
    "typescript": "^5",
    "vitest": "^4.1.9"
  }
}
```

The `@realm/clover` dependency is for the `IntegrationsConfigStore` **type** only. That is a sideways import between two plugin packages; if a reviewer objects, the correct fix is to move `IntegrationsConfigStore` and `integrationsConfigSchema` down into `@realm/crm` and have both plugins depend on that. Do not invert the direction.

Create `packages/google-reviews/tsconfig.json`:

```json
{ "extends": "../../tsconfig.base.json", "compilerOptions": { "lib": ["ES2022", "DOM"], "jsx": "react-jsx" }, "include": ["src"] }
```

Create `packages/google-reviews/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing tests**

Create `packages/google-reviews/src/__tests__/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  parseGoogleReviewsConfig,
  DEFAULT_GOOGLE_REVIEWS_CONFIG,
} from "../config";

describe("parseGoogleReviewsConfig", () => {
  it("returns the default for empty or invalid input", () => {
    expect(parseGoogleReviewsConfig(undefined)).toEqual(DEFAULT_GOOGLE_REVIEWS_CONFIG);
    expect(parseGoogleReviewsConfig({ installed: "yes" })).toEqual(DEFAULT_GOOGLE_REVIEWS_CONFIG);
  });

  it("defaults provider to places", () => {
    expect(parseGoogleReviewsConfig({ installed: true }).provider).toBe("places");
  });

  it("keeps a configured place id", () => {
    const cfg = parseGoogleReviewsConfig({ installed: true, placeId: "ChIJabc" });
    expect(cfg).toEqual({ installed: true, placeId: "ChIJabc", provider: "places" });
  });
});
```

Create `packages/google-reviews/src/__tests__/places-provider.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mapPlaceDetails } from "../places-provider";

const raw = {
  rating: 4.8,
  userRatingCount: 119,
  googleMapsUri: "https://maps.google.com/?cid=123",
  reviews: [
    {
      rating: 5,
      text: { text: "Best chaat in Scarborough." },
      relativePublishTimeDescription: "2 weeks ago",
      authorAttribution: {
        displayName: "Priya S.",
        photoUri: "https://lh3.googleusercontent.com/a/priya",
        uri: "https://www.google.com/maps/contrib/1",
      },
    },
  ],
};

describe("mapPlaceDetails", () => {
  it("maps a Places response into a ReviewsSummary", () => {
    expect(mapPlaceDetails(raw)).toEqual({
      rating: 4.8,
      total: 119,
      attributionUrl: "https://maps.google.com/?cid=123",
      reviews: [
        {
          author: "Priya S.",
          rating: 5,
          text: "Best chaat in Scarborough.",
          relativeTime: "2 weeks ago",
          profilePhotoUrl: "https://lh3.googleusercontent.com/a/priya",
          authorUrl: "https://www.google.com/maps/contrib/1",
        },
      ],
    });
  });

  it("returns null when the payload has no rating (never a zero rating)", () => {
    expect(mapPlaceDetails({})).toBeNull();
    expect(mapPlaceDetails({ userRatingCount: 10 })).toBeNull();
  });

  it("tolerates a place with a rating but no review bodies", () => {
    const summary = mapPlaceDetails({ rating: 4.2, userRatingCount: 8 });
    expect(summary).toEqual({
      rating: 4.2,
      total: 8,
      attributionUrl: "",
      reviews: [],
    });
  });

  it("drops individual reviews that carry no text", () => {
    const summary = mapPlaceDetails({
      rating: 5,
      userRatingCount: 1,
      reviews: [{ rating: 5, authorAttribution: { displayName: "A" } }],
    });
    expect(summary!.reviews).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @realm/google-reviews test`
Expected: FAIL — cannot resolve `../config` and `../places-provider`.

- [ ] **Step 4: Write plugin meta, config and types**

Create `packages/google-reviews/src/plugin.ts`:

```ts
/**
 * Client-safe Google Reviews plugin catalog metadata.
 * No secrets, no fetch — safe for Integrations UI and settings hubs.
 */
export const GOOGLE_REVIEWS_PLUGIN_ID = "googleReviews" as const;

export const GOOGLE_REVIEWS_PLUGIN = {
  id: GOOGLE_REVIEWS_PLUGIN_ID,
  label: "Google Reviews",
  description:
    "Show real Google ratings and reviews on the public site, and invite customers to leave one.",
} as const;
```

Create `packages/google-reviews/src/config.ts`:

```ts
import { z } from "zod";

export const googleReviewsConfigSchema = z.object({
  installed: z.boolean().default(false),
  /** Google Place ID of the business, e.g. "ChIJ…". Cacheable indefinitely. */
  placeId: z.string().optional(),
  provider: z.enum(["places", "business-profile"]).default("places"),
});
export type GoogleReviewsConfig = z.infer<typeof googleReviewsConfigSchema>;

export const DEFAULT_GOOGLE_REVIEWS_CONFIG: GoogleReviewsConfig = {
  installed: false,
  provider: "places",
};

/** NULL/garbage config → uninstalled. Never throws on read. */
export function parseGoogleReviewsConfig(raw: unknown): GoogleReviewsConfig {
  const parsed = googleReviewsConfigSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_GOOGLE_REVIEWS_CONFIG;
}

/**
 * Server env only — the key is never stored in the DB and never reaches the
 * client. Mirrors OPTIMOROUTE_API_KEY: secrets in env, config in the blob.
 */
export function loadPlacesApiKeyFromEnv(): string | null {
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  return key ? key : null;
}
```

Create `packages/google-reviews/src/types.ts`:

```ts
export type Review = {
  author: string;
  rating: number;
  text: string;
  relativeTime: string;
  profilePhotoUrl?: string;
  authorUrl?: string;
};

export type ReviewsSummary = {
  rating: number;
  total: number;
  reviews: Review[];
  /** Link back to the Google listing — attribution is required. */
  attributionUrl: string;
};

/**
 * `places` ships now (API key, max 5 reviews, no pagination).
 * `business-profile` lands when Google grants API access; it returns every
 * review and is also the surface that supports replying.
 */
export type ReviewsProvider = {
  id: "places" | "business-profile";
  fetchSummary(placeId: string): Promise<ReviewsSummary | null>;
};
```

- [ ] **Step 5: Write the Places provider**

Create `packages/google-reviews/src/places-provider.ts`:

```ts
import { loadPlacesApiKeyFromEnv } from "./config";
import type { Review, ReviewsProvider, ReviewsSummary } from "./types";

const PLACES_ENDPOINT = "https://places.googleapis.com/v1/places";
const FIELD_MASK = "rating,userRatingCount,googleMapsUri,reviews";

/** Six hours. Reviews move slowly; ratings should not be a day stale. */
const REVALIDATE_SECONDS = 21600;

type RawReview = {
  rating?: number;
  text?: { text?: string };
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
};

type RawPlace = {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: RawReview[];
};

/**
 * Map a Places "place details" payload into a ReviewsSummary.
 * Returns null when there is no rating — callers render nothing rather than a
 * zero-star block, because wrong social proof is worse than none.
 */
export function mapPlaceDetails(raw: RawPlace): ReviewsSummary | null {
  if (typeof raw.rating !== "number") return null;

  const reviews: Review[] = (raw.reviews ?? []).flatMap((r) => {
    const text = r.text?.text?.trim();
    const author = r.authorAttribution?.displayName?.trim();
    if (!text || !author || typeof r.rating !== "number") return [];
    return [
      {
        author,
        rating: r.rating,
        text,
        relativeTime: r.relativePublishTimeDescription ?? "",
        profilePhotoUrl: r.authorAttribution?.photoUri,
        authorUrl: r.authorAttribution?.uri,
      },
    ];
  });

  return {
    rating: raw.rating,
    total: raw.userRatingCount ?? 0,
    attributionUrl: raw.googleMapsUri ?? "",
    reviews,
  };
}

export const placesProvider: ReviewsProvider = {
  id: "places",

  async fetchSummary(placeId: string): Promise<ReviewsSummary | null> {
    const apiKey = loadPlacesApiKeyFromEnv();
    if (!apiKey || !placeId) return null;

    let res: Response;
    try {
      res = await fetch(`${PLACES_ENDPOINT}/${encodeURIComponent(placeId)}`, {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        next: { revalidate: REVALIDATE_SECONDS },
      });
    } catch {
      return null;
    }
    if (!res.ok) return null;

    try {
      return mapPlaceDetails((await res.json()) as RawPlace);
    } catch {
      return null;
    }
  },
};
```

- [ ] **Step 6: Write the server barrel**

Create `packages/google-reviews/src/index.ts`:

```ts
/** Server-only barrel. Client components import from `@realm/google-reviews/ui`. */
export * from "./config";
export * from "./types";
export * from "./places-provider";
export { GOOGLE_REVIEWS_PLUGIN, GOOGLE_REVIEWS_PLUGIN_ID } from "./plugin";
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @realm/google-reviews test`
Expected: PASS — 7 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/google-reviews pnpm-lock.yaml
git commit -m "feat(google-reviews): add package with config, provider interface, and Places provider"
```

---

### Task 6: Google Reviews plugin wired into both apps

**Files:**
- Create: `packages/google-reviews/src/store.ts`
- Create: `packages/google-reviews/src/summary.ts`
- Create: `packages/google-reviews/src/ui/index.ts`
- Create: `packages/google-reviews/src/ui/google-reviews-settings-panel.tsx`
- Create: `apps/<app>/lib/plugins/google-reviews-plugin.ts` (both apps)
- Create: `apps/<app>/app/(dashboard)/dashboard/settings/google-reviews/page.tsx` (both apps)
- Create: `apps/<app>/app/(dashboard)/dashboard/settings/google-reviews/actions.ts` (both apps)
- Modify: `apps/<app>/lib/plugins.ts`, `apps/<app>/lib/plugins.server.ts` (both apps)
- Modify: `apps/<app>/next.config.ts` (both apps)
- Modify: `apps/<app>/app/(dashboard)/dashboard/settings/page.tsx` (both apps)
- Test: `packages/google-reviews/src/__tests__/store.test.ts`

**Interfaces:**
- Consumes: everything from Task 5; `PluginServer` from `@realm/crm/server`; each app's `integrationsConfigStore`.
- Produces: `getGoogleReviewsConfig(store)`, `setGoogleReviewsConfig(store, cfg)`, `installGoogleReviews(store)`, `uninstallGoogleReviews(store)`, `getReviewsSummary(store)`, `GoogleReviewsSettingsPanel`; `googleReviewsPlugin(store)` per app.

- [ ] **Step 1: Write the failing store test**

Create `packages/google-reviews/src/__tests__/store.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { IntegrationsConfigStore } from "@realm/clover";
import {
  getGoogleReviewsConfig,
  installGoogleReviews,
  uninstallGoogleReviews,
  setGoogleReviewsConfig,
} from "../store";

function memoryStore(initial: Record<string, unknown> = {}): IntegrationsConfigStore & {
  raw: () => Record<string, unknown>;
} {
  let cfg: Record<string, unknown> = { ...initial };
  return {
    get: async () => cfg,
    set: async (next) => {
      cfg = next as Record<string, unknown>;
    },
    raw: () => cfg,
  };
}

describe("google reviews store", () => {
  it("reads the default when nothing is stored", async () => {
    expect(await getGoogleReviewsConfig(memoryStore())).toEqual({
      installed: false,
      provider: "places",
    });
  });

  it("install sets installed without touching other plugin keys", async () => {
    const store = memoryStore({ clover: { installed: true, connected: true } });
    await installGoogleReviews(store);
    expect(store.raw().clover).toEqual({ installed: true, connected: true });
    expect(await getGoogleReviewsConfig(store)).toMatchObject({ installed: true });
  });

  it("uninstall clears installed but keeps the place id for reinstall", async () => {
    const store = memoryStore();
    await setGoogleReviewsConfig(store, {
      installed: true,
      placeId: "ChIJabc",
      provider: "places",
    });
    await uninstallGoogleReviews(store);
    expect(await getGoogleReviewsConfig(store)).toEqual({
      installed: false,
      placeId: "ChIJabc",
      provider: "places",
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/google-reviews test -- store`
Expected: FAIL — cannot resolve `../store`.

- [ ] **Step 3: Write the store and summary modules**

Create `packages/google-reviews/src/store.ts`:

```ts
import type { IntegrationsConfigStore } from "@realm/clover";
import {
  DEFAULT_GOOGLE_REVIEWS_CONFIG,
  parseGoogleReviewsConfig,
  type GoogleReviewsConfig,
} from "./config";
import { GOOGLE_REVIEWS_PLUGIN_ID } from "./plugin";

export async function getGoogleReviewsConfig(
  store: IntegrationsConfigStore,
): Promise<GoogleReviewsConfig> {
  const cfg = await store.get();
  const raw = (cfg as Record<string, unknown>)[GOOGLE_REVIEWS_PLUGIN_ID];
  return raw ? parseGoogleReviewsConfig(raw) : { ...DEFAULT_GOOGLE_REVIEWS_CONFIG };
}

export async function setGoogleReviewsConfig(
  store: IntegrationsConfigStore,
  next: GoogleReviewsConfig,
): Promise<void> {
  const cfg = await store.get();
  await store.set({ ...cfg, [GOOGLE_REVIEWS_PLUGIN_ID]: parseGoogleReviewsConfig(next) });
}

export async function installGoogleReviews(store: IntegrationsConfigStore): Promise<void> {
  const current = await getGoogleReviewsConfig(store);
  await setGoogleReviewsConfig(store, { ...current, installed: true });
}

/** Keeps placeId so a reinstall does not force re-entering it. No secrets live here. */
export async function uninstallGoogleReviews(store: IntegrationsConfigStore): Promise<void> {
  const current = await getGoogleReviewsConfig(store);
  await setGoogleReviewsConfig(store, { ...current, installed: false });
}
```

Create `packages/google-reviews/src/summary.ts`:

```ts
import type { IntegrationsConfigStore } from "@realm/clover";
import { placesProvider } from "./places-provider";
import { getGoogleReviewsConfig } from "./store";
import type { ReviewsProvider, ReviewsSummary } from "./types";

const PROVIDERS: Record<string, ReviewsProvider> = {
  places: placesProvider,
  // "business-profile" lands with the Business Profile API grant.
};

/**
 * Public-site entry point. Returns null whenever reviews cannot be shown —
 * plugin uninstalled, no place id, no API key, or the API failed. Callers
 * render nothing in that case; a stale or zeroed rating is worse than none.
 */
export async function getReviewsSummary(
  store: IntegrationsConfigStore,
): Promise<ReviewsSummary | null> {
  const cfg = await getGoogleReviewsConfig(store);
  if (!cfg.installed || !cfg.placeId) return null;

  const provider = PROVIDERS[cfg.provider];
  if (!provider) return null;

  return provider.fetchSummary(cfg.placeId);
}
```

Append to `packages/google-reviews/src/index.ts`:

```ts
export * from "./store";
export * from "./summary";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/google-reviews test`
Expected: PASS — 10 tests.

- [ ] **Step 5: Write the settings panel**

Create `packages/google-reviews/src/ui/google-reviews-settings-panel.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";

export type SaveGoogleReviewsPlaceId = (
  placeId: string,
) => Promise<{ error?: string; rating?: number; total?: number }>;

export function GoogleReviewsSettingsPanel({
  placeId,
  apiKeyConfigured,
  onSave,
}: {
  placeId: string;
  /** False when GOOGLE_PLACES_API_KEY is missing on the server. */
  apiKeyConfigured: boolean;
  onSave: SaveGoogleReviewsPlaceId;
}) {
  const [value, setValue] = useState(placeId);
  const [result, setResult] = useState<{ rating: number; total: number } | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      const res = await onSave(value.trim());
      if (res.error) {
        setResult(null);
        toast.error(res.error);
        return;
      }
      setResult(
        typeof res.rating === "number" && typeof res.total === "number"
          ? { rating: res.rating, total: res.total }
          : null,
      );
      toast.success("Google Reviews settings saved");
    });

  return (
    <div className="space-y-4">
      {!apiKeyConfigured ? (
        <p className="text-destructive text-sm">
          GOOGLE_PLACES_API_KEY is not set on the server. Reviews will not load until it is.
        </p>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="place-id">Google Place ID</Label>
        <Input
          id="place-id"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ChIJ…"
        />
        <p className="text-muted-foreground text-sm">
          Find it with Google&rsquo;s Place ID Finder for your business listing.
        </p>
      </div>

      <Button type="button" disabled={pending} onClick={save}>
        Save and test
      </Button>

      {result ? (
        <p className="text-ok text-sm">
          Connected — {result.rating.toFixed(1)}★ across {result.total} reviews.
        </p>
      ) : null}
    </div>
  );
}
```

Create `packages/google-reviews/src/ui/index.ts`:

```ts
export {
  GoogleReviewsSettingsPanel,
  type SaveGoogleReviewsPlaceId,
} from "./google-reviews-settings-panel";
```

- [ ] **Step 6: Write the plugin adapter — once, in the package**

**Modularity ruling (binding):** the adapter lives in the package, not in either app.

Add `GOOGLE_REVIEWS_PLUGIN_META` to `packages/google-reviews/src/plugin.ts` (client-safe, alongside the existing meta constant):

```ts
import { StarIcon } from "lucide-react";
import type { PluginMeta } from "@realm/crm";

export const GOOGLE_REVIEWS_PLUGIN_META: PluginMeta = {
  id: GOOGLE_REVIEWS_PLUGIN_ID,
  label: GOOGLE_REVIEWS_PLUGIN.label,
  description: GOOGLE_REVIEWS_PLUGIN.description,
  icon: StarIcon,
  settingsHref: "/dashboard/settings/google-reviews",
};
```

Create `packages/google-reviews/src/plugin.server.ts`:

```ts
import type { IntegrationsConfigStore } from "@realm/crm/server";
import type { PluginServer, PluginStatus } from "@realm/crm/server";
import { GOOGLE_REVIEWS_PLUGIN_ID } from "./plugin";
import { getGoogleReviewsConfig, installGoogleReviews, uninstallGoogleReviews } from "./store";

export function googleReviewsPlugin(store: IntegrationsConfigStore): PluginServer {
  return {
    id: GOOGLE_REVIEWS_PLUGIN_ID,

    async status(): Promise<PluginStatus> {
      const cfg = await getGoogleReviewsConfig(store);
      if (!cfg.installed) return { installed: false };
      return {
        installed: true,
        statusLabel: cfg.placeId ? "Installed" : "Installed · needs a Place ID",
      };
    },

    install: () => installGoogleReviews(store),
    uninstall: () => uninstallGoogleReviews(store),
  };
}
```

Add `"./server": "./src/plugin.server.ts"` to the package's `exports`.

**Note on the `@realm/clover` dependency:** Task 4 moved `IntegrationsConfigStore` down into `@realm/crm/server`, so this package imports the port from `@realm/crm` and the `@realm/clover` dependency added in Task 5 is no longer needed. Remove `"@realm/clover": "workspace:*"` from `packages/google-reviews/package.json` and repoint `src/store.ts` and `src/summary.ts` to import the port from `@realm/crm/server`. A plugin package must not depend on an unrelated plugin package.

Each app then adds exactly one line to each registry file:

```ts
// lib/plugins.ts
import { GOOGLE_REVIEWS_PLUGIN_META } from "@realm/google-reviews/plugin";
// …append GOOGLE_REVIEWS_PLUGIN_META to PLUGIN_METAS

// lib/plugins.server.ts
import { googleReviewsPlugin } from "@realm/google-reviews/server";
// …append googleReviewsPlugin(integrationsConfigStore) to PLUGINS
```

- [ ] **Step 7: Write the settings route (both apps)**

Create `apps/puchkaman/app/(dashboard)/dashboard/settings/google-reviews/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  getGoogleReviewsConfig,
  setGoogleReviewsConfig,
  placesProvider,
} from "@realm/google-reviews";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { currentUserId, recordAudit } from "@/lib/services/session-service";

export async function saveGoogleReviewsPlaceId(
  placeId: string,
): Promise<{ error?: string; rating?: number; total?: number }> {
  await requireAdmin();

  if (!placeId) return { error: "Enter a Google Place ID" };

  const summary = await placesProvider.fetchSummary(placeId);
  if (!summary) {
    return { error: "Google returned nothing for that Place ID. Check the ID and the API key." };
  }

  const current = await getGoogleReviewsConfig(integrationsConfigStore);
  await setGoogleReviewsConfig(integrationsConfigStore, { ...current, placeId });

  await recordAudit({
    entity: "integrations",
    entityPublicId: "googleReviews",
    operation: "update",
    changes: { _action: "google_reviews_place_id", placeId },
    createdBy: await currentUserId(),
  });

  revalidatePath("/dashboard/settings/google-reviews");
  revalidatePath("/dashboard/settings/integrations");
  revalidatePath("/", "layout");

  return { rating: summary.rating, total: summary.total };
}
```

Create `apps/puchkaman/app/(dashboard)/dashboard/settings/google-reviews/page.tsx`:

```tsx
import { StarIcon } from "lucide-react";
import { PageHeader, PageShell } from "@realm/design-system";
import { getGoogleReviewsConfig, loadPlacesApiKeyFromEnv } from "@realm/google-reviews";
import { GoogleReviewsSettingsPanel } from "@realm/google-reviews/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { saveGoogleReviewsPlaceId } from "./actions";

export default async function GoogleReviewsSettingsPage() {
  await requireAdmin();
  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);

  return (
    <PageShell>
      <PageHeader
        icon={StarIcon}
        title="Google Reviews"
        subtitle="Show real Google ratings on the public site."
      />
      <GoogleReviewsSettingsPanel
        placeId={cfg.placeId ?? ""}
        apiKeyConfigured={Boolean(loadPlacesApiKeyFromEnv())}
        onSave={saveGoogleReviewsPlaceId}
      />
    </PageShell>
  );
}
```

Mirror both files into tiffin-grab, importing `integrationsConfigStore` from `@/lib/services/app-settings.service` and dropping `PageShell` if that app's settings pages do not use it (match the sibling `settings/clover/page.tsx` in each app).

Add a gated section to each app's `settings/page.tsx`, mirroring the existing Clover block:

```ts
const googleReviews = await getGoogleReviewsConfig(integrationsConfigStore);
if (googleReviews.installed) {
  sections.push({
    key: "google-reviews",
    label: "Google Reviews",
    description: "Place ID and public review display.",
    icon: StarIcon,
    href: "/dashboard/settings/google-reviews",
  });
}
```

- [ ] **Step 8: Add the package to `transpilePackages` in BOTH apps**

In `apps/puchkaman/next.config.ts` and `apps/tiffin-grab/next.config.ts`, append `"@realm/google-reviews"` to the `transpilePackages` array. **`tsc` cannot catch this** — a missing entry fails only at runtime in the browser.

Add the workspace dependency to both apps' `package.json`:

```json
"@realm/google-reviews": "workspace:*"
```

Run: `pnpm install`

- [ ] **Step 9: Verify by eye**

1. `google-reviews-settings-panel.tsx` line 1 is `"use client";`.
2. `GoogleReviewsSettingsPanel` is a named export in `src/ui/index.ts`.
3. Both `next.config.ts` files list `@realm/google-reviews`.

- [ ] **Step 10: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

Manual check: with `GOOGLE_PLACES_API_KEY` set and a real Place ID, Settings → Integrations shows the Google Reviews card; install it, open Settings → Google Reviews, save the Place ID, and confirm the rating/count come back.

- [ ] **Step 11: Commit**

```bash
git add -A packages/google-reviews apps pnpm-lock.yaml
git commit -m "feat(google-reviews): wire the plugin and settings into both apps"
```

---

### Task 7: Live reviews on the puchkaman public homepage

**Files:**
- Modify: `apps/puchkaman/app/(marketing)/page.tsx` (lines 48-52, 131, 145, 191, 293-320)

**Interfaces:**
- Consumes: `getReviewsSummary(store)` from `@realm/google-reviews` (Task 6).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Fetch the summary in the page**

`apps/puchkaman/app/(marketing)/page.tsx` is the marketing homepage. Add the fetch at the top of the default export (make it `async` if it is not already):

```tsx
import { getReviewsSummary } from "@realm/google-reviews";
import { integrationsConfigStore } from "@/lib/services/integrations.service";

// …inside the page component:
const reviews = await getReviewsSummary(integrationsConfigStore);
```

Because this reads app settings at render time, add at the top of the file:

```tsx
export const dynamic = "force-dynamic";
```

- [ ] **Step 2: Delete the fabricated data**

Remove the `const REVIEWS = [...]` block at lines 48-52 entirely. It is fabricated social proof and must not survive as a fallback.

- [ ] **Step 3: Render the section from live data, or not at all**

Replace the REVIEWS `<section>` (lines 293-320) so the whole section is conditional and the copy comes from the fetched summary:

```tsx
{reviews && reviews.reviews.length > 0 ? (
  <section className="section-pad surface-ink" style={{ background: "var(--ink)", color: "var(--cream)", borderBottom: "var(--border)" }}>
    <div className="wrap">
      <SectionHead
        kicker="Social Proof"
        title="Scarborough Is Obsessed"
        light
        sub={`${reviews.rating.toFixed(1)}★ across ${reviews.total}+ Google reviews. Here's what the neighbourhood says.`}
      />
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(290px, 1fr))" }}>
        {reviews.reviews.map((rv, i) => (
          <Reveal key={`${rv.author}-${i}`} delay={i * 70}>
            <div className="card" style={{ background: "var(--white)", color: "var(--ink)", padding: 24, height: "100%" }}>
              <Stars value={rv.rating} size={18} />
              <p style={{ fontWeight: 600, fontSize: "1.05rem", margin: "14px 0 18px", lineHeight: 1.5 }}>&ldquo;{rv.text}&rdquo;</p>
              <div className="flex center" style={{ gap: 10 }}>
                <span style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--yellow)", border: "2.5px solid var(--ink)", display: "grid", placeItems: "center", fontWeight: 900 }}>
                  {rv.author[0]}
                </span>
                <div>
                  <div style={{ fontWeight: 800 }}>{rv.author}</div>
                  <div className="mono" style={{ fontSize: "0.7rem", opacity: 0.6 }}>
                    <a href={reviews.attributionUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                      Google Review
                    </a>
                    {rv.relativeTime ? ` · ${rv.relativeTime}` : null}
                  </div>
                </div>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  </section>
) : null}
```

The `· Verified` claim is dropped — it was never verified. The Google label now links to the listing, which is the required attribution.

- [ ] **Step 4: Replace the three other hardcoded counts**

Three more places state the fabricated figures. Each must become conditional on `reviews`:

- Line ~131: `★ 4.8 on Google · 119+ reviews` → render only when `reviews` is non-null, using `` `★ ${reviews.rating.toFixed(1)} on Google · ${reviews.total}+ reviews` ``.
- Line ~145 (`Pill`): same treatment — omit the pill entirely when `reviews` is null.
- Line ~191 (stat block): `119+ reviews` → `` `${reviews.total}+` `` with the stat omitted when `reviews` is null.

Search the file for `4.8` and `119` afterwards to confirm no literal remains:

Run: `rg -n "4\.8|119" "apps/puchkaman/app/(marketing)/page.tsx"`
Expected: no matches.

- [ ] **Step 5: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

Manual check, three states: (a) plugin uninstalled → no reviews section, no rating pills, page still renders; (b) installed with a valid Place ID → real reviews and real counts; (c) installed with `GOOGLE_PLACES_API_KEY` unset → section absent, no error page.

- [ ] **Step 6: Commit**

```bash
git add "apps/puchkaman/app/(marketing)/page.tsx"
git commit -m "feat(puchkaman): render real Google reviews and drop the fabricated counts"
```

---

### Task 8: Reviews surface on the tiffin-grab public site

**Files:**
- Create: `apps/tiffin-grab/components/marketing/google-reviews-section.tsx`
- Modify: the tiffin-grab public landing page (locate with `rg -l "export default" "apps/tiffin-grab/app/(marketing)"`; if that route group does not exist, use `apps/tiffin-grab/app/page.tsx`)

**Interfaces:**
- Consumes: `getReviewsSummary(store)` from `@realm/google-reviews`.
- Produces: `GoogleReviewsSection` server component.

- [ ] **Step 1: Write the section component**

Create `apps/tiffin-grab/components/marketing/google-reviews-section.tsx`. This is a **server** component — no `"use client"` — because it awaits the summary:

```tsx
import { StarIcon } from "lucide-react";
import { getReviewsSummary } from "@realm/google-reviews";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";

export async function GoogleReviewsSection() {
  const summary = await getReviewsSummary(integrationsConfigStore);
  if (!summary || summary.reviews.length === 0) return null;

  return (
    <section className="py-16">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-8 flex flex-wrap items-baseline gap-2">
          <h2 className="text-2xl font-bold">What customers say</h2>
          <a
            href={summary.attributionUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground text-sm underline"
          >
            {summary.rating.toFixed(1)}★ from {summary.total} Google reviews
          </a>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summary.reviews.map((r, i) => (
            <figure key={`${r.author}-${i}`} className="rounded-xl border bg-muted/30 p-5">
              <div className="mb-3 flex gap-0.5" aria-label={`${r.rating} out of 5`}>
                {Array.from({ length: r.rating }).map((_, s) => (
                  <StarIcon key={s} className="size-4 fill-current" />
                ))}
              </div>
              <blockquote className="text-sm leading-relaxed">{r.text}</blockquote>
              <figcaption className="text-muted-foreground mt-4 text-xs">
                {r.author}
                {r.relativeTime ? ` · ${r.relativeTime}` : null} · Google Review
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Mount it on the landing page**

Import and render `<GoogleReviewsSection />` in the public landing page, above the footer. Add `export const dynamic = "force-dynamic";` to that page if it is not already dynamic — it now reads app settings at render.

- [ ] **Step 3: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

Manual check: with the plugin uninstalled the section is absent and the page renders normally.

- [ ] **Step 4: Commit**

```bash
git add -A apps/tiffin-grab
git commit -m "feat(tiffin-grab): add a Google reviews section to the public site"
```

---

### Task 9: `review_nudges` table, store port, and eligibility

**Modularity ruling (binding):** the table definition AND the Drizzle store live in `@realm/google-reviews`. A Drizzle `pgTable` is a declaration, not an app dependency — the package can own it, and each app re-exports it from its schema barrel so `drizzle-kit` discovers it and generates that app's own migration. Neither app writes any nudge query code.

**Files:**
- Create: `packages/google-reviews/src/nudge.ts` (port + pure helpers)
- Create: `packages/google-reviews/src/db.ts` (table + Drizzle store factory)
- Modify: `packages/google-reviews/package.json` (add `drizzle-orm`, `./db` export)
- Test: `packages/google-reviews/src/__tests__/nudge.test.ts`
- Modify: `apps/puchkaman/db/schema/index.ts`, `apps/tiffin-grab/db/schema/index.ts` (one re-export line each)
- Create: `apps/puchkaman/lib/services/review-nudge.service.ts`, `apps/tiffin-grab/lib/services/review-nudge.service.ts` (two lines each — bind the app's `db`)
- Modify: `packages/google-reviews/src/index.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ReviewNudgeState`, `ReviewNudgeStore`, `shouldNudge`, `writeReviewUrl` from `@realm/google-reviews`; `reviewNudges` (table) and `drizzleReviewNudgeStore(db)` from `@realm/google-reviews/db`; `reviewNudgeStore` per app.

**Why a table and not columns on `users`:** puchkaman has no customer accounts — public orders are guest checkout carrying `orders.customer_email` (`apps/puchkaman/db/schema/orders.ts:90`). Keying nudges on email works for both apps, and adding a table avoids an `ALTER` on the live auth `users` table.

- [ ] **Step 1: Write the failing eligibility test**

Create `packages/google-reviews/src/__tests__/nudge.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldNudge, writeReviewUrl } from "../nudge";

describe("shouldNudge", () => {
  it("is true when the customer has never been nudged", () => {
    expect(shouldNudge(undefined)).toBe(true);
    expect(shouldNudge({ sentAt: null, doneAt: null })).toBe(true);
  });

  it("is false once an email has been sent", () => {
    expect(shouldNudge({ sentAt: new Date("2026-08-01"), doneAt: null })).toBe(false);
  });

  it("is false once the customer has clicked or dismissed", () => {
    expect(shouldNudge({ sentAt: null, doneAt: new Date("2026-08-01") })).toBe(false);
  });
});

describe("writeReviewUrl", () => {
  it("builds the Google write-review link for a place", () => {
    expect(writeReviewUrl("ChIJabc")).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJabc",
    );
  });

  it("url-encodes the place id", () => {
    expect(writeReviewUrl("a b")).toBe(
      "https://search.google.com/local/writereview?placeid=a%20b",
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/google-reviews test -- nudge`
Expected: FAIL — cannot resolve `../nudge`.

- [ ] **Step 3: Write the nudge module**

Create `packages/google-reviews/src/nudge.ts`:

```ts
export type ReviewNudgeState = {
  /** When the review-request email was sent. */
  sentAt: Date | null;
  /** When the customer clicked through or dismissed. Suppresses both channels. */
  doneAt: Date | null;
};

/** App-injected persistence, keyed by customer email. */
export type ReviewNudgeStore = {
  get(email: string): Promise<ReviewNudgeState | undefined>;
  markSent(email: string): Promise<void>;
  markDone(email: string): Promise<void>;
};

/** Once per customer, forever: either channel having fired closes it out. */
export function shouldNudge(state: ReviewNudgeState | undefined): boolean {
  if (!state) return true;
  return state.sentAt === null && state.doneAt === null;
}

export function writeReviewUrl(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}
```

Append to `packages/google-reviews/src/index.ts`:

```ts
export * from "./nudge";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/google-reviews test`
Expected: PASS — 15 tests.

- [ ] **Step 5: Put the table and the store in the package**

Create `packages/google-reviews/src/db.ts`:

```ts
import { eq, sql } from "drizzle-orm";
import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import type { ReviewNudgeStore, ReviewNudgeState } from "./nudge";

/**
 * One row per customer email, ever. Email is the key rather than a user id
 * because puchkaman orders are guest checkout — there is no user row to hang
 * this on, and email is the one identifier both apps always have.
 *
 * Each app re-exports this from its own schema barrel so drizzle-kit generates
 * that app's migration; the table definition itself is shared.
 */
export const reviewNudges = pgTable(
  "review_nudges",
  {
    email: text("email").primaryKey(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("review_nudges_sent_idx").on(t.sentAt)],
);

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Bind the store to an app's Drizzle client. `db` is typed loosely on purpose:
 * the two apps construct their clients separately and this package must not
 * depend on either app's schema barrel.
 */
export function drizzleReviewNudgeStore(db: {
  select: (...args: never[]) => never;
  insert: (table: typeof reviewNudges) => never;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}): ReviewNudgeStore {
  // The narrow structural type above documents intent; the calls below need
  // Drizzle's full builder, so the handle is widened once, here, and never
  // leaks out of this factory.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = db as any;

  return {
    async get(email: string): Promise<ReviewNudgeState | undefined> {
      const [row] = await d
        .select({ sentAt: reviewNudges.sentAt, doneAt: reviewNudges.doneAt })
        .from(reviewNudges)
        .where(eq(reviewNudges.email, normalize(email)))
        .limit(1);
      return row ?? undefined;
    },

    // Upsert, not read-then-write: two concurrent triggers for the same
    // customer would both see "never nudged" and both send. COALESCE keeps the
    // first timestamp, so the primary key makes a double send impossible.
    async markSent(email: string): Promise<void> {
      await d
        .insert(reviewNudges)
        .values({ email: normalize(email), sentAt: new Date() })
        .onConflictDoUpdate({
          target: reviewNudges.email,
          set: { sentAt: sql`COALESCE(${reviewNudges.sentAt}, EXCLUDED.sent_at)` },
        });
    },

    async markDone(email: string): Promise<void> {
      await d
        .insert(reviewNudges)
        .values({ email: normalize(email), doneAt: new Date() })
        .onConflictDoUpdate({
          target: reviewNudges.email,
          set: { doneAt: sql`COALESCE(${reviewNudges.doneAt}, EXCLUDED.done_at)` },
        });
    },
  };
}
```

If the loose `db` typing above proves awkward, prefer importing Drizzle's `NodePgDatabase` type and typing the parameter as `NodePgDatabase<Record<string, never>>` — that is strictly better than `any` and still app-agnostic. Report which you used.

Add to `packages/google-reviews/package.json`: `"drizzle-orm"` in `dependencies` (match the version the apps already use — check `apps/tiffin-grab/package.json`), and `"./db": "./src/db.ts"` in `exports`.

Re-export the table from each app's `db/schema/index.ts` so drizzle-kit sees it:

```ts
export { reviewNudges } from "@realm/google-reviews/db";
```

- [ ] **Step 6: Generate and apply the migrations**

```bash
pnpm --filter puchkaman db:generate
pnpm --filter tiffin-grab db:generate
```

Inspect each generated `.sql` before applying. Expected: a single `CREATE TABLE "review_nudges"` plus one `CREATE INDEX`, and **nothing else**. If drizzle emits any `DROP` or `ALTER` on an existing table, stop and investigate — do not apply it.

Apply to the local dev databases:

```bash
pnpm --filter puchkaman db:migrate
pnpm --filter tiffin-grab db:migrate
```

- [ ] **Step 7: Bind the store in each app**

The whole app-side implementation is now two lines. Create `apps/puchkaman/lib/services/review-nudge.service.ts`:

```ts
import { drizzleReviewNudgeStore } from "@realm/google-reviews/db";
import { db } from "@/db/client";

export const reviewNudgeStore = drizzleReviewNudgeStore(db);
```

Create the same file in `apps/tiffin-grab/lib/services/`. If `@realm/google-reviews` is not yet in an app's `package.json` from Task 6, add `"@realm/google-reviews": "workspace:*"` and run `pnpm install`.

- [ ] **Step 8: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add -A packages/google-reviews apps/puchkaman apps/tiffin-grab
git commit -m "feat(google-reviews): add review nudge storage, port, and eligibility"
```

---

### Task 10: Send the nudge — email in both apps, in-app card in tiffin-grab

**Files:**
- Create: `packages/google-reviews/src/nudge-email.ts`
- Create: `packages/google-reviews/src/ui/review-nudge-card.tsx`
- Modify: `packages/google-reviews/src/ui/index.ts`, `packages/google-reviews/src/index.ts`
- Create: `apps/puchkaman/lib/services/review-nudge-dispatch.ts`
- Create: `apps/tiffin-grab/app/api/cron/review-nudge/route.ts`
- Create: `apps/tiffin-grab/app/api/reviews/nudge/click/route.ts`
- Create: `apps/tiffin-grab/app/(customer)/me/review-nudge.tsx`
- Modify: `apps/tiffin-grab/app/(customer)/me/page.tsx`
- Modify: puchkaman's order-fulfilment path (locate with `rg -n '"fulfilled"' apps/puchkaman/lib`)
- Test: `packages/google-reviews/src/__tests__/nudge-email.test.ts`

**Interfaces:**
- Consumes: `shouldNudge`, `writeReviewUrl`, `ReviewNudgeStore` (Task 9); `getGoogleReviewsConfig` (Task 6); `@realm/email` SES provider.
- Produces: `renderReviewNudgeEmail`, `dispatchReviewNudge`, `ReviewNudgeCard`.

**Trigger differs per app, because the data does:**
- **puchkaman** — orders have a real transition: `order_status` includes `fulfilled` (`db/schema/orders.ts:8`). Fire there.
- **tiffin-grab** — `delivery_status` is `scheduled | paused | skipped | cancelled` (`db/schema/deliveries.ts:6`); there is no `delivered` state. "Delivered" means a past-dated `scheduled` delivery, so there is no transition to hook. Fire from a daily cron instead, alongside the existing `app/api/cron/optimoroute-sync` route.

- [ ] **Step 1: Write the failing email test**

Create `packages/google-reviews/src/__tests__/nudge-email.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { renderReviewNudgeEmail } from "../nudge-email";

describe("renderReviewNudgeEmail", () => {
  it("addresses the customer by name", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      customerName: "Priya",
      placeId: "ChIJabc",
    });
    expect(r.html).toContain("Priya");
  });

  it("links to the Google write-review page", async () => {
    const r = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      customerName: "Priya",
      placeId: "ChIJabc",
    });
    expect(r.html).toContain("https://search.google.com/local/writereview?placeid=ChIJabc");
  });

  it("names the business in the subject", async () => {
    const r = await renderReviewNudgeEmail({ businessName: "Puchkaman", placeId: "ChIJabc" });
    expect(r.subject).toContain("Puchkaman");
  });

  it("falls back to a neutral greeting with no customer name", async () => {
    const r = await renderReviewNudgeEmail({ businessName: "Puchkaman", placeId: "ChIJabc" });
    expect(r.html).toContain("Hi there");
  });

  it("produces a plaintext alternative alongside the HTML", async () => {
    const r = await renderReviewNudgeEmail({ businessName: "Puchkaman", placeId: "ChIJabc" });
    expect(r.text).toContain("Puchkaman");
    expect(r.text).not.toContain("<p>");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @realm/google-reviews test -- nudge-email`
Expected: FAIL — cannot resolve `../nudge-email`.

- [ ] **Step 3: Write the email renderer**

**Ruling (binding):** use `@realm/email`'s renderer, not a hand-rolled string template — it gives branded chrome, a real plaintext alternative, and consistency with every other transactional mail in the repo.

`renderEmailTemplate` (`packages/email/src/render/email.tsx:21`) takes `{ subject, body, vars, appName }`, interpolates `{{vars}}` into a markdown body, and returns `{ subject, html, text }`.

Create `packages/google-reviews/src/nudge-email.ts`:

```ts
import { renderEmailTemplate } from "@realm/email";
import { writeReviewUrl } from "./nudge";

const SUBJECT = "How was your order from {{businessName}}?";

const BODY = `{{greeting}},

Thanks for ordering from {{businessName}}. If you enjoyed it, would you leave us a Google review? It takes about a minute and helps enormously.

[Leave a Google review]({{reviewUrl}})

Thank you,
{{businessName}}`;

export async function renderReviewNudgeEmail(input: {
  businessName: string;
  customerName?: string;
  placeId: string;
}): Promise<{ subject: string; html: string; text: string }> {
  return renderEmailTemplate({
    subject: SUBJECT,
    body: BODY,
    appName: input.businessName,
    vars: {
      businessName: input.businessName,
      greeting: input.customerName?.trim() ? `Hi ${input.customerName.trim()}` : "Hi there",
      reviewUrl: writeReviewUrl(input.placeId),
    },
  });
}
```

Add `"@realm/email": "workspace:*"` to `packages/google-reviews/package.json` dependencies and run `pnpm install`.

Because this is now async, every caller must `await` it — the dispatch helper and the cron below already do.

Append to `packages/google-reviews/src/index.ts`:

```ts
export * from "./nudge-email";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @realm/google-reviews test`
Expected: PASS — 19 tests.

- [ ] **Step 5: Write the shared dispatch helper (puchkaman)**

Create `apps/puchkaman/lib/services/review-nudge-dispatch.ts`:

```ts
import {
  getGoogleReviewsConfig,
  renderReviewNudgeEmail,
  shouldNudge,
} from "@realm/google-reviews";
import { logger } from "@realm/commons/logger";
import { sendEmail } from "@/lib/services/email.service";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";

/**
 * Send one review request, once per customer email, ever.
 * Never throws: a failed nudge must not fail the order it rides on.
 */
export async function dispatchReviewNudge(input: {
  email: string;
  name?: string;
}): Promise<void> {
  try {
    const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
    if (!cfg.installed || !cfg.placeId) return;

    if (!shouldNudge(await reviewNudgeStore.get(input.email))) return;

    const mail = await renderReviewNudgeEmail({
      businessName: "Puchkaman",
      customerName: input.name,
      placeId: cfg.placeId,
    });

    // Claim first: an upsert before send means a crash mid-send cannot produce
    // a second email later. One missed nudge beats nagging a customer twice.
    await reviewNudgeStore.markSent(input.email);
    await sendEmail({ to: input.email, ...mail });
  } catch (err) {
    logger.error({ err }, "review nudge dispatch failed");
  }
}
```

Confirm the real signature of the app's email sender before writing this file:

Run: `rg -n "export async function sendEmail|export const sendEmail" apps/puchkaman/lib`

Adapt the call to whatever that reveals. If puchkaman has no email service wrapper, use `@realm/email`'s SES provider directly, matching how tiffin-grab sends transactional mail (`rg -n "SesEmailProvider|sendEmail" apps/tiffin-grab/lib | head`).

- [ ] **Step 6: Fire it on puchkaman order fulfilment**

Locate where an order's status is set to `fulfilled`:

Run: `rg -n '"fulfilled"' apps/puchkaman/lib apps/puchkaman/app`

In that service function, after the status update commits, add:

```ts
await dispatchReviewNudge({ email: order.customerEmail, name: order.customerName });
```

It is `await`ed but cannot throw (Step 5 swallows and logs), so it cannot fail the fulfilment.

- [ ] **Step 7: Write the tiffin-grab daily cron**

Create `apps/tiffin-grab/app/api/cron/review-nudge/route.ts`. The bearer-secret check below is the same fail-closed contract as `app/api/cron/optimoroute-sync/route.ts`:

```ts
import { and, isNull, lt, eq } from "drizzle-orm";
import {
  getGoogleReviewsConfig,
  renderReviewNudgeEmail,
  shouldNudge,
} from "@realm/google-reviews";
import { logger } from "@realm/commons/logger";
import { db } from "@/db/client";
import { deliveries, users, reviewNudges } from "@/db/schema";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";
import { sendEmail } from "@/lib/services/email.service";

export const dynamic = "force-dynamic";

/** Customers with at least one past scheduled delivery and no nudge yet. */
async function handle(request: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  // Fail closed: no configured secret, or a mismatched bearer → 401.
  if (!secret || authorization !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
  if (!cfg.installed || !cfg.placeId) {
    return Response.json({ skipped: "plugin not configured" }, { status: 503 });
  }

  const today = new Date().toISOString().slice(0, 10);

  const candidates = await db
    .selectDistinct({ email: users.email, name: users.name })
    .from(deliveries)
    .innerJoin(users, eq(deliveries.userId, users.id))
    .leftJoin(reviewNudges, eq(reviewNudges.email, users.email))
    .where(
      and(
        eq(deliveries.status, "scheduled"),
        lt(deliveries.deliveryDate, today),
        isNull(reviewNudges.email),
      ),
    )
    .limit(200);

  let sent = 0;
  for (const c of candidates) {
    if (!c.email) continue;
    if (!shouldNudge(await reviewNudgeStore.get(c.email))) continue;
    try {
      const mail = await renderReviewNudgeEmail({
        businessName: "Tiffin Grab",
        customerName: c.name ?? undefined,
        placeId: cfg.placeId,
      });
      await reviewNudgeStore.markSent(c.email);
      await sendEmail({ to: c.email, ...mail });
      sent += 1;
    } catch (err) {
      logger.error({ err, email: c.email }, "review nudge send failed");
    }
  }

  return Response.json({ candidates: candidates.length, sent });
}

export const GET = handle;
export const POST = handle;
```

Before writing, confirm the real column names on `deliveries` (`userId`, `deliveryDate`, `status`) and on `users` (`email`, `name`):

Run: `rg -n "export const deliveries = pgTable" -A 20 apps/tiffin-grab/db/schema/deliveries.ts`

The `limit(200)` is deliberate — `# ponytail: capped batch, add a cursor if the backlog ever exceeds one run`.

- [ ] **Step 8: Write the in-app card and click route (tiffin-grab only)**

puchkaman has no customer app, so this is tiffin-grab only.

Create `packages/google-reviews/src/ui/review-nudge-card.tsx`:

```tsx
"use client";

import { StarIcon, XIcon } from "lucide-react";
import { useTransition } from "react";
import { Button } from "@realm/ui/button";

export function ReviewNudgeCard({
  businessName,
  reviewUrl,
  onDismiss,
}: {
  businessName: string;
  reviewUrl: string;
  /** Marks the nudge done server-side; also called on click-through. */
  onDismiss: () => Promise<void>;
}) {
  const [pending, start] = useTransition();

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4">
      <StarIcon className="mt-0.5 size-5 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">Enjoying {businessName}?</p>
        <p className="text-muted-foreground text-sm">
          A Google review takes a minute and helps enormously.
        </p>
        <Button asChild size="sm" onClick={() => start(async () => void onDismiss())}>
          <a href={reviewUrl} target="_blank" rel="noreferrer">
            Leave a review
          </a>
        </Button>
      </div>
      <button
        type="button"
        aria-label="Dismiss"
        disabled={pending}
        className="text-muted-foreground hover:text-foreground"
        onClick={() => start(async () => void onDismiss())}
      >
        <XIcon className="size-4" />
      </button>
    </div>
  );
}
```

Export it from `packages/google-reviews/src/ui/index.ts`:

```ts
export { ReviewNudgeCard } from "./review-nudge-card";
```

Create `apps/tiffin-grab/app/(customer)/me/review-nudge.tsx` — a server component that decides whether to render, plus the server action that marks it done:

```tsx
import { getGoogleReviewsConfig, shouldNudge, writeReviewUrl } from "@realm/google-reviews";
import { ReviewNudgeCard } from "@realm/google-reviews/ui";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";
import { getSession } from "@/lib/auth/session";
import { markReviewNudgeDone } from "./review-nudge-actions";

export async function ReviewNudge() {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return null;

  const cfg = await getGoogleReviewsConfig(integrationsConfigStore);
  if (!cfg.installed || !cfg.placeId) return null;

  if (!shouldNudge(await reviewNudgeStore.get(email))) return null;

  return (
    <ReviewNudgeCard
      businessName="Tiffin Grab"
      reviewUrl={writeReviewUrl(cfg.placeId)}
      onDismiss={markReviewNudgeDone}
    />
  );
}
```

Create `apps/tiffin-grab/app/(customer)/me/review-nudge-actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { reviewNudgeStore } from "@/lib/services/review-nudge.service";
import { getSession } from "@/lib/auth/session";

export async function markReviewNudgeDone(): Promise<void> {
  const session = await getSession();
  const email = session?.user?.email;
  if (!email) return;
  await reviewNudgeStore.markDone(email);
  revalidatePath("/me");
}
```

Confirm the real session helper name before writing:

Run: `rg -n "export async function getSession|export const getSession" apps/tiffin-grab/lib`

Mount `<ReviewNudge />` in `apps/tiffin-grab/app/(customer)/me/page.tsx`, inside a `<Suspense>` so it never delays the customer home render.

A server action replaces the `/api/reviews/nudge/click` route from the spec — the action already runs authenticated and returns to the same page, so a redirect route would be extra machinery for nothing. The click is still tracked (`markDone` fires on both click-through and dismiss); the email link remains untracked, as specified.

- [ ] **Step 9: Verify by eye**

1. `review-nudge-card.tsx` line 1 is `"use client";`.
2. `review-nudge.tsx` has **no** `"use client"` — it awaits data and must stay a server component.
3. `ReviewNudgeCard` is a named export from `src/ui/index.ts`.

- [ ] **Step 10: Verify**

Run: `pnpm turbo typecheck && pnpm turbo test`
Expected: PASS.

Manual checks:
- puchkaman: mark a test order `fulfilled` → one email; mark a second order for the same email `fulfilled` → **no** second email.
- tiffin-grab: hit the cron route twice → the second run reports `sent: 0`.
- tiffin-grab customer home: card appears once, disappears after dismiss, and does not return on reload.

- [ ] **Step 11: Commit**

```bash
git add -A packages/google-reviews apps/puchkaman apps/tiffin-grab
git commit -m "feat(google-reviews): send the review nudge by email and in-app, once per customer"
```

---

## Post-Plan: operator steps

These are not code tasks and block only Tasks 7, 8 and 10 at runtime.

1. Enable the Places API and billing on a Google Cloud project; create `GOOGLE_PLACES_API_KEY`, restricted to that API and to the server IPs. Add it to each app's SSM parameter path (`/tiffin-grab/prod/*`, and puchkaman's equivalent) as a `SecureString`.
2. Find and record the Google Place ID for each business, and enter it under Settings → Google Reviews in each app.
3. Register the tiffin-grab `review-nudge` cron on the same schedule mechanism as `optimoroute-sync`.
4. Submit the Google Business Profile API access request, which is the prerequisite for the follow-on review-replies spec.

## Follow-on specs (explicitly not in this plan)

- Clover Payment provider — retrofit puchkaman's live Clover iframe checkout behind `PaymentProviderDef`, and give it `requiresPlugin: "clover"`, the first real consumer of `requires`.
- Stripe payment provider.
- Review replies / admin review inbox on `businessProfileProvider`.
- Wire `PluginServer.nav()` into puchkaman's `getNavSections`, replacing the `cloverInstalled` boolean prop.
