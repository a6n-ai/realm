# `@realm/places` on Amazon Location — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move puchkaman's address search and geocoding onto Amazon Location behind a `@realm/places` provider interface, remove the public Google browser key entirely, and put every call in the cheapest bucket that legally covers it.

**Architecture:** A `PlaceProvider` interface with three implementations (AWS, Google, Nominatim) and a fallback chain. `suggest()` uses the Label bucket ($0.20/1k); `resolve({ persist })` selects Core ($0.50/1k) or Stored ($4.00/1k) depending on whether the caller keeps the result. Autocomplete proxies through the app's own IAM-signed, rate-limited route, so no vendor key ships to the browser.

**Tech Stack:** TypeScript, Next.js 16 (App Router, RSC), `@aws-sdk/client-geo-places`, zod 4, vitest 4, pnpm + Turborepo.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-09-realm-places-aws-location-design.md`.
- **The bucket split is the entire cost case.** Label and Stored differ by **20×**. `suggest()` must never use Stored; `resolve({ persist: true })` must, and only when the result is written to the database. A regression here has **no functional symptom** — everything works, the bill goes up 20×.
- **`persist` is a required parameter**, never defaulted. A caller must state whether the result is kept.
- **Nothing may throw.** `resolveAddress` returning `null` is how checkout stays up; a thrown error there takes delivery offline. Every layer returns `null`.
- **No vendor key in the browser after Task 4.** `NEXT_PUBLIC_GOOGLE_MAPS_KEY` must not survive.
- **A package never imports an app.** Names carry nothing puchkaman-specific.
- Credentials come from the default provider chain, matching `SESv2Client` in `@realm/email` — instance role in prod, `realm-admin` profile locally. **Never construct a client with hardcoded credentials.**
- This repo is **public**: no AWS account IDs, ARNs containing them, or key material in any committed file.
- Pricing/licensing facts (verified, us-east-1): Label $0.20/1k, Core $0.50/1k, Advanced $1.50/1k, Stored $4.00/1k, map tiles $0.04/1k. Only Stored may be persisted indefinitely.
- Existing behaviour that must not change: zone/type semantics, checkout contract, pricing arithmetic, the `.strict()` schema, the per-IP throttle.
- **Run every command in the FOREGROUND.** `pnpm turbo test` hangs; use `pnpm --filter <pkg> ...`.
- `docs/` is gitignored; committing specs/plans needs `git add -f`.
- Commit after every task.

## Existing code this builds on

- `apps/puchkaman/lib/delivery/resolve-address.ts` — exports `ResolvedAddress = { lat, lng, formattedAddress }` and `resolveAddress({ placeId?, address })`. Google Places v1 → text search → Nominatim → `null`. **Never throws.** Callers: `lib/services/orders.service.ts`, `app/api/delivery/check-address/route.ts`.
- `apps/puchkaman/lib/http/rate-limit.ts` — `isRateLimited(rawKey, max, windowMs)`, with IPv6 `/64` bucketing.
- `apps/puchkaman/lib/http/client-ip.ts` — `clientIp(request)`, reads the trusted `x-real-ip`.
- `apps/puchkaman/app/api/delivery/check-address/route.ts` — `CHECK_ADDRESS_LIMIT = 20`, `CHECK_ADDRESS_WINDOW_MS = 60_000`.
- `apps/puchkaman/components/order/address-autocomplete.tsx` — 128 lines, loads the Google Places JS widget with hand-rolled `google.maps` types.

## File Structure

| File | Responsibility |
|---|---|
| `packages/places/package.json` | Manifest; `@aws-sdk/client-geo-places`, zod; `.` and `./ui` entrypoints |
| `packages/places/src/types.ts` | `PlaceProvider`, `PlaceSuggestion`, `ResolvedPlace` |
| `packages/places/src/aws-provider.ts` | Amazon Location — Label suggest, Core/Stored resolve |
| `packages/places/src/google-provider.ts` | Existing Google logic, moved |
| `packages/places/src/nominatim.ts` | Existing keyless fallback, moved |
| `packages/places/src/resolve.ts` | Provider selection + fallback chain |
| `packages/places/src/index.ts` | Server barrel |
| `packages/places/src/__tests__/provider-conformance.ts` | Shared suite both providers must pass |
| `apps/puchkaman/app/api/delivery/suggest/route.ts` | Throttled autocomplete proxy |
| `apps/puchkaman/components/order/address-autocomplete.tsx` | Rewritten — own route, no vendor script |
| `apps/puchkaman/lib/delivery/resolve-address.ts` | Thin binding to the package |

---

### Task 1: The interface and the fallback chain

**Files:**
- Create: `packages/places/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/places/src/types.ts`, `src/resolve.ts`, `src/index.ts`
- Test: `packages/places/src/__tests__/resolve.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `PlaceProvider`, `PlaceSuggestion`, `ResolvedPlace`, `resolvePlace(providers, input)`.

- [ ] **Step 1: Scaffold the package**

`packages/places/package.json` — model on `packages/google-reviews/package.json`:

```json
{
  "name": "@realm/places",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts", "./ui": "./src/ui/index.ts" },
  "types": "./src/index.ts",
  "scripts": { "typecheck": "tsc --noEmit", "test": "vitest run" },
  "dependencies": { "@aws-sdk/client-geo-places": "^3.700.0", "zod": "^4.4.3" },
  "peerDependencies": { "react": "^19" },
  "devDependencies": { "@types/node": "^22", "@types/react": "^19", "react": "19.2.4", "typescript": "^5", "vitest": "^4.1.9" }
}
```

`tsconfig.json` and `vitest.config.ts` copy `packages/google-reviews`'s. Run `pnpm install` from the repo root and **report the resolved `@aws-sdk/client-geo-places` version** — if that package name does not exist, stop and report BLOCKED rather than guessing an alternative.

- [ ] **Step 2: Write the failing test**

`packages/places/src/__tests__/resolve.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { resolvePlace } from "../resolve";
import type { PlaceProvider, ResolvedPlace } from "../types";

const hit: ResolvedPlace = { lat: 43.7, lng: -79.3, formattedAddress: "3315 Danforth Ave" };

function provider(id: PlaceProvider["id"], result: ResolvedPlace | null): PlaceProvider {
  return { id, suggest: async () => [], resolve: async () => result };
}

describe("resolvePlace", () => {
  it("returns the first provider's hit without consulting later ones", async () => {
    const second = provider("google", hit);
    const spy = vi.spyOn(second, "resolve");
    expect(await resolvePlace([provider("aws", hit), second], { address: "x", persist: false })).toEqual(hit);
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls through to the next provider on null", async () => {
    expect(await resolvePlace([provider("aws", null), provider("google", hit)], { address: "x", persist: false })).toEqual(hit);
  });

  it("returns null when every provider misses", async () => {
    expect(await resolvePlace([provider("aws", null), provider("nominatim", null)], { address: "x", persist: false })).toBeNull();
  });

  it("does not throw when a provider throws — it falls through", async () => {
    const boom: PlaceProvider = {
      id: "aws", suggest: async () => [],
      resolve: async () => { throw new Error("network"); },
    };
    expect(await resolvePlace([boom, provider("google", hit)], { address: "x", persist: false })).toEqual(hit);
  });

  it("passes persist through to the provider unchanged", async () => {
    const p = provider("aws", hit);
    const spy = vi.spyOn(p, "resolve");
    await resolvePlace([p], { address: "x", persist: true });
    expect(spy).toHaveBeenCalledWith({ address: "x", persist: true });
  });
});
```

The throwing-provider test is the one that matters: a provider that throws must not take checkout down.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @realm/places test`
Expected: FAIL — cannot resolve `../resolve`.

- [ ] **Step 4: Implement**

`packages/places/src/types.ts`:

```ts
export type PlaceSuggestion = {
  placeId: string;
  /** Display string for the dropdown. The cheap bucket returns exactly this. */
  label: string;
};

export type ResolvedPlace = { lat: number; lng: number; formattedAddress: string };

export type PlaceProvider = {
  id: "aws" | "google" | "nominatim";
  /** Typeahead. Cheapest bucket — id + text only, never persisted. */
  suggest(query: string, opts?: { near?: { lat: number; lng: number }; country?: string }): Promise<PlaceSuggestion[]>;
  /**
   * `persist: true` selects the storage-licensed bucket (AWS `IntendedUse = "Storage"`),
   * ~8x the price of Core. Set it ONLY when the result is written to a database —
   * it is both the legal and the cost boundary.
   */
  resolve(input: { placeId?: string; address: string; persist: boolean }): Promise<ResolvedPlace | null>;
};
```

`packages/places/src/resolve.ts`:

```ts
import type { PlaceProvider, ResolvedPlace } from "./types";

/**
 * First provider to return a hit wins. A provider that throws is treated as a
 * miss — a geocoding outage must never take checkout down, which is why this
 * swallows rather than propagates.
 */
export async function resolvePlace(
  providers: PlaceProvider[],
  input: { placeId?: string; address: string; persist: boolean },
): Promise<ResolvedPlace | null> {
  for (const provider of providers) {
    try {
      const hit = await provider.resolve(input);
      if (hit) return hit;
    } catch {
      // fall through to the next provider
    }
  }
  return null;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @realm/places test`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/places pnpm-lock.yaml
git commit -m "feat(places): add the provider interface and fallback chain"
```

---

### Task 2: The Amazon Location provider

**Files:**
- Create: `packages/places/src/aws-provider.ts`
- Test: `packages/places/src/__tests__/aws-provider.test.ts`

**Interfaces:**
- Consumes: `PlaceProvider` (Task 1).
- Produces: `awsPlaceProvider(opts?: { client?: GeoPlacesClient; region?: string })`.

- [ ] **Step 1: Write the failing test — bucket selection is the point**

`packages/places/src/__tests__/aws-provider.test.ts`. Inject a fake client that records the commands it is sent, so the assertions are on **what we ask AWS for**, not on a response shape:

```ts
import { describe, it, expect, vi } from "vitest";
import { awsPlaceProvider } from "../aws-provider";

function fakeClient(response: unknown) {
  const sent: unknown[] = [];
  return {
    sent,
    client: { send: vi.fn(async (cmd: unknown) => { sent.push(cmd); return response; }) },
  };
}

describe("awsPlaceProvider bucket selection", () => {
  it("suggest never requests additional features — Label bucket", async () => {
    const f = fakeClient({ ResultItems: [{ PlaceId: "p1", Title: "3315 Danforth Ave" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    await p.suggest("danfor");
    const input = (f.sent[0] as { input: Record<string, unknown> }).input;
    expect(input.AdditionalFeatures).toBeUndefined();
    expect(input.IntendedUse).toBeUndefined();
  });

  it("resolve with persist:false does NOT set IntendedUse Stored — Core bucket", async () => {
    const f = fakeClient({ ResultItems: [{ Position: [-79.3, 43.7], Address: { Label: "3315 Danforth Ave" } }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    await p.resolve({ address: "3315 Danforth Ave", persist: false });
    const input = (f.sent[0] as { input: Record<string, unknown> }).input;
    expect(input.IntendedUse).not.toBe("Storage");
  });

  it("resolve with persist:true sets IntendedUse Storage", async () => {
    const f = fakeClient({ ResultItems: [{ Position: [-79.3, 43.7], Address: { Label: "3315 Danforth Ave" } }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    await p.resolve({ address: "3315 Danforth Ave", persist: true });
    const input = (f.sent[0] as { input: Record<string, unknown> }).input;
    expect(input.IntendedUse).toBe("Storage");
  });
});
```

Add mapping tests too: a response with no results → `null`; a malformed response → `null`; `suggest` maps `PlaceId`/`Title` to `placeId`/`label`; note AWS returns `Position` as **`[lng, lat]`** — GeoJSON order — so assert the mapping does not transpose it. A transposed pair puts Toronto in Somalia and every address falls outside every zone.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @realm/places test -- aws-provider`
Expected: FAIL — cannot resolve `../aws-provider`.

- [ ] **Step 3: Implement**

Create `packages/places/src/aws-provider.ts` using `@aws-sdk/client-geo-places`: `AutocompleteCommand` (or `SuggestCommand`) for `suggest`, `GeocodeCommand`/`GetPlaceCommand` for `resolve`.

Rules:
- **Client construction matches `@realm/email`'s `SESv2Client`:** `new GeoPlacesClient({ region })`, credentials from the default provider chain. Accept an injected `client` for tests. Never hardcode credentials.
- `suggest` sends **no** `AdditionalFeatures` and **no** `IntendedUse` — that is what selects Label.
- `resolve` sets `IntendedUse: "Storage"` **only** when `persist` is true.
- **Verified against the installed SDK:** the enum is `SINGLE_USE: "SingleUse"` / `STORAGE: "Storage"`. The AWS *docs* say `Stored`; the SDK says `Storage`. Trust the SDK. Sending `SingleUse` explicitly for the non-persisting path is clearer than omitting it — prefer explicit.
- Bias `suggest` to `near` and restrict to `country` when supplied.
- **Never throw.** Wrap every call; return `[]` from `suggest` and `null` from `resolve` on any failure.
- Map `Position` `[lng, lat]` → `{ lat, lng }` explicitly, with a comment naming the order.

If the SDK's command names or field names differ from the above, **follow the SDK** and say so in your report — do not bend the SDK to match this plan.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @realm/places test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/places
git commit -m "feat(places): add the Amazon Location provider with explicit bucket selection"
```

---

### Task 3: Move Google and Nominatim behind the interface

**Files:**
- Create: `packages/places/src/google-provider.ts`, `src/nominatim.ts`
- Create: `packages/places/src/__tests__/provider-conformance.ts`
- Test: `packages/places/src/__tests__/google-provider.test.ts`

**Interfaces:**
- Produces: `googlePlaceProvider()`, `nominatimProvider()`, `runProviderConformance(name, makeProvider)`.

- [ ] **Step 1: Move the existing logic**

`apps/puchkaman/lib/delivery/resolve-address.ts` already contains working Google Places v1 and Nominatim logic. **Port it, do not rewrite it** — it has been reviewed and has passing tests. Reshape it to the `PlaceProvider` interface:

- `google-provider.ts` — Places Details by `placeId`, then text search. `suggest()` uses Places Autocomplete. Reads `GOOGLE_PLACES_API_KEY` from server env; returns `null`/`[]` when unset rather than throwing.
- `nominatim.ts` — the existing keyless fallback. `suggest()` returns `[]` (Nominatim is not a typeahead provider); `resolve()` keeps its current behaviour. `persist` is ignored — OSM data has no equivalent bucket — and that must be stated in a comment.

- [ ] **Step 2: Write the shared conformance suite**

`packages/places/src/__tests__/provider-conformance.ts` exports a function both provider test files call:

```ts
export function runProviderConformance(name: string, makeProvider: () => PlaceProvider): void
```

It must assert the contract every provider owes, independent of vendor:

- `suggest()` returns `[]` (never throws) when the upstream fails
- `suggest()` returns `[]` for an empty query
- `resolve()` returns `null` (never throws) when the upstream fails
- `resolve()` returns `null` for an empty address with no `placeId`
- a successful `resolve()` returns finite `lat`/`lng` and a non-empty `formattedAddress`
- latitude is within ±90 and longitude within ±180 — this is the transposition guard, and it belongs in the shared suite because *every* provider can get it wrong

Call it from both `aws-provider.test.ts` and `google-provider.test.ts`. An interface with two implementations where only one is tested is indirection, not an interface.

- [ ] **Step 3: Run**

Run: `pnpm --filter @realm/places test`
Expected: PASS — conformance green for both providers.

- [ ] **Step 4: Commit**

```bash
git add packages/places
git commit -m "feat(places): move Google and Nominatim behind the provider interface"
```

---

### Task 4: Wire puchkaman — suggest route, no browser key

**Files:**
- Create: `apps/puchkaman/app/api/delivery/suggest/route.ts`
- Modify: `apps/puchkaman/lib/delivery/resolve-address.ts`
- Modify: `apps/puchkaman/components/order/address-autocomplete.tsx`
- Modify: `apps/puchkaman/app/api/delivery/check-address/route.ts`, `lib/services/orders.service.ts`
- Modify: `apps/puchkaman/package.json`, `next.config.ts`

- [ ] **Step 1: The suggest route**

```
POST /api/delivery/suggest   { query: string }  →  { suggestions: PlaceSuggestion[] }
```

- Public, throttled with the **existing** `isRateLimited` + `clientIp` from `lib/http/`. Use a **tighter limit than check-address** (which is 20/min) — suggest is per-keystroke: 60/min is a reasonable start. Define the constants beside the route like `CHECK_ADDRESS_LIMIT`.
- Returns `{ suggestions: [] }` on no match — **never** an error status.
- Never returns coordinates. Suggestions are `{ placeId, label }` only; coordinates are the server's business and arrive at resolve time.

- [ ] **Step 2: Rebind `resolveAddress`**

Keep the exported signature `resolveAddress({ placeId?, address })` and the `ResolvedAddress` type so **no call site changes shape**. Internally it becomes:

```ts
const providers = buildProviders();   // PLACES_PROVIDER env picks primary; others follow as fallback
export async function resolveAddress(input: { placeId?: string; address: string }) {
  return resolvePlace(providers, { ...input, persist: false });
}
export async function resolveAddressForStorage(input: { placeId?: string; address: string }) {
  return resolvePlace(providers, { ...input, persist: true });
}
```

Then point the two call sites at the right one:

- **`lib/services/orders.service.ts`** → `resolveAddressForStorage` — it writes `delivery_lat`/`delivery_lng`.
- **`app/api/delivery/check-address/route.ts`** → `resolveAddress` — it persists nothing.

Two functions rather than a boolean parameter at the call site: the name states the cost and the licence at the point of use, and it is hard to pass the wrong one by accident.

- [ ] **Step 3: Rewrite the autocomplete component**

`components/order/address-autocomplete.tsx` currently loads the Google Places JS widget with hand-rolled `google.maps` types. Replace with: a plain input, a debounced (~250ms) fetch to `/api/delivery/suggest`, and a suggestions dropdown.

- Keep the **same props** (`value`, `onChange`, `onPick({ address, placeId })`, `id`, `className`) so `checkout-client.tsx` and `delivery-checker.tsx` need no changes.
- Keep puchkaman's brutal styling (`className="input"`).
- Delete the hand-rolled `google.maps` types and the script loader.
- Keyboard support: arrow keys to move through suggestions, Enter to pick, Escape to dismiss. The old widget gave this for free; hand-rolled dropdowns routinely lose it.
- A typed address with no suggestion picked must still submit — `placeId` stays optional.

- [ ] **Step 4: Remove the browser key**

- Delete `NEXT_PUBLIC_GOOGLE_MAPS_KEY` from `apps/puchkaman/.env.example`.
- Add `"@realm/places": "workspace:*"` to `apps/puchkaman/package.json`; `pnpm install`.
- `@realm/places/ui` is not client-consumed in this task (the component lives in the app), so no `transpilePackages` entry is needed — **verify** rather than assume.

**Phase 2 caveat:** the admin zone map still uses the Google Maps SDK and still needs that key. Do **not** delete the key from deployment config in this task — only from `.env.example` and the public-site code path. State clearly in your report that the key remains required by `catalogue/delivery-zones` until Phase 2.

- [ ] **Step 5: Verify**

```
pnpm --filter @realm/places test
pnpm --filter puchkaman typecheck
pnpm --filter puchkaman test
rg -n "NEXT_PUBLIC_GOOGLE_MAPS_KEY" apps/puchkaman/components apps/puchkaman/app/\(marketing\)
```

The `rg` must return **no matches** — no browser key on the public site. (Hits under `app/(dashboard)/dashboard/catalogue` are expected until Phase 2.)

By eye: `"use client"` intact on the rewritten component; no AWS credential or SDK import reaches a client component.

- [ ] **Step 6: Commit**

```bash
git add -A apps/puchkaman pnpm-lock.yaml
git commit -m "feat(puchkaman): server-side address suggest, no browser maps key on the public site"
```

---

### Task 5: Address-quality gate before AWS becomes default

**Files:**
- Create: `packages/places/src/__tests__/fixtures/canadian-addresses.ts`
- Create: `packages/places/scripts/compare-providers.ts`

**This task decides whether `PLACES_PROVIDER=aws` is safe. It does not flip it.**

- [ ] **Step 1: Build the fixture**

~15 real Scarborough/Toronto addresses in `canadian-addresses.ts`, deliberately including:

- addresses **with unit/apartment numbers** (`Apt 802`, `Unit 4`, `#12`) — we recently fixed these being silently dropped, and this is the risk that matters
- a plaza/mall address
- a rural-route or PO-box style address
- one address with a common misspelling
- the shop's own address as a control

- [ ] **Step 2: Write the comparison script**

`scripts/compare-providers.ts` runs each fixture through both providers and prints a table: input, each provider's `formattedAddress`, each provider's coordinates, and the **distance in metres between them**.

It is a script, not a test — it needs real credentials and real network, and must never run in CI. Guard it: refuse to run without `GOOGLE_PLACES_API_KEY` and AWS credentials present, with a message saying so.

- [ ] **Step 3: Run it and record the result**

Run it with real credentials and paste the full table into your report. Flag specifically:

- any address where AWS **drops a unit number** Google keeps
- any pair more than **100 m** apart (near a 7 km zone edge that can flip which types are offered)
- any address one provider resolves and the other does not

- [ ] **Step 4: Recommend, do not decide**

End your report with a recommendation — `PLACES_PROVIDER=aws` is safe, or Google should stay primary — and the evidence for it. **Do not change any default.** The operator flips the env var.

If AWS is materially worse on Canadian subpremise data, the package still ships and the browser key is still gone. That outcome is a success, not a failure.

- [ ] **Step 5: Commit**

```bash
git add packages/places
git commit -m "test(places): Canadian address fixture and a provider comparison script"
```

---

## Phase 2 — admin map on MapLibre (separate plan)

**Not in this plan.** Phase 1 delivers the cost, licensing and key-removal wins. The admin map is one
internal screen and carries the only genuine technical risk: MapLibre has no circle primitive, so the
editable radius becomes a Turf.js polygon with hand-rolled handles.

When it is planned, the entry conditions are:

1. Evaluate [`maplibre-gl-geo-editor`](https://github.com/opengeos/maplibre-gl-geo-editor) first.
2. The radius **number input stays the source of truth**; the map is visualisation.
3. The **server-side clamp stays authoritative** — unchanged by any map work.
4. **Ship-blocking condition:** if neither route yields a circle editor as good as the current one,
   Phase 2 stops and the admin map stays on Google.

## Post-plan: operator steps

1. Attach to the app role: `geo-places:Autocomplete`, `geo-places:Suggest`, `geo-places:Geocode`,
   `geo-places:GetPlace`. (`geo-maps:GetTile` only when Phase 2 lands.)
2. Read Task 5's comparison table, then set `PLACES_PROVIDER=aws` if the recommendation supports it.
3. **Keep `NEXT_PUBLIC_GOOGLE_MAPS_KEY` in deployment config** — the admin map still needs it until
   Phase 2. It is no longer used by the public site.
4. Watch the first month's Location bill against the model: ~$6.60 at ~1,000 orders. Materially more
   means a call landed in the wrong bucket — check that `suggest` is not requesting
   `AdditionalFeatures` and that only `orders.service.ts` uses the storage path.

## Follow-ups (out of scope)

- Cache `placeId → ResolvedPlace`; `placeId` is stable and cacheable, and would cut repeat Stored calls.
- Lift `@realm/places` into tiffin-grab if it wants geocoding.
- Amazon Location Routes for driving distance.
