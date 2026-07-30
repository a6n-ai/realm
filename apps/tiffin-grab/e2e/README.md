# Playwright E2E — Realm / tiffin-grab

## Unit vs E2E (use both)

| Layer | Tool | Command | Use for |
|-------|------|---------|---------|
| **Unit / component** | Vitest + Testing Library | `pnpm --filter tiffin-grab test` | Services, pricing, Zod schemas, form logic, isolated UI |
| **Browser E2E** | Playwright (`e2e/`) | `pnpm --filter tiffin-grab test:e2e` | Every feature *surface* + critical user journeys in a real browser |

Playwright is **not** a unit-test runner. Prefer Vitest for pure logic; add a Playwright case when the bug only shows up in the browser (routing, auth, dialogs, drawers, full pages).

## Prerequisites

1. App: `pnpm --filter tiffin-grab dev`
2. Seeded users (`scripts/reseed-e2e-users.ts`):
   - Admin: `info@foodmonks.ca` / `AdminDev123!`
   - Customer: `customer@tiffingrab.ca` / `Customer123!`
3. Optional: `E2E_BASE_URL`, `E2E_ADMIN_EMAIL`, `E2E_ADMIN_PASSWORD`, `E2E_CUSTOMER_EMAIL`, `E2E_CUSTOMER_PASSWORD`

## Commands

```bash
# Install browsers once
pnpm --filter tiffin-grab exec playwright install chromium

# All E2E projects (public + admin + customer)
pnpm --filter tiffin-grab test:e2e

# Surfaces
pnpm --filter tiffin-grab test:e2e:public
pnpm --filter tiffin-grab test:e2e:admin
pnpm --filter tiffin-grab test:e2e:customer

# Filter
pnpm --filter tiffin-grab test:e2e -- --grep "New inquiry"

# UI mode / HTML report
pnpm --filter tiffin-grab test:e2e:ui
pnpm --filter tiffin-grab exec playwright show-report e2e/playwright-report
```

Route registries also have a Vitest check: `e2e/__tests__/routes.registry.test.ts` (runs with `pnpm test`).

## Layout

```
e2e/
  playwright.config.ts       # projects: setup-*, public, admin, customer
  fixtures.ts                # shared test + desktop viewport
  auth.setup.admin.ts
  auth.setup.customer.ts
  helpers/                   # assert, auth
  pages/                     # page objects (AdminShell, LeadSheet, LoginPage, …)
  public/                    # marketing + auth smoke + flows
  admin/                     # CRM routes + create flows
  customer/                  # /me/* routes + flows
  __tests__/                 # Vitest on route registries
  .auth/                     # storage state (gitignored)
```

## Adding coverage for a new feature

1. **Smoke**: add the route to `admin/routes.ts`, `public/routes.ts`, or `customer/routes.ts`.
2. **Journey**: add a case in `*/flows.spec.ts` (or a new `*.spec.ts`).
3. Prefer role/label selectors; reuse page objects under `pages/`.
4. Put pure logic assertions in Vitest under `lib/**/__tests__` or next to the component — not in Playwright.
