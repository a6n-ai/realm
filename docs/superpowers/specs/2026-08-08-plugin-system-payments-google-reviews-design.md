# Plugin contract, Payments as a plugin, and Google Reviews

**Date:** 2026-08-08
**Status:** Approved design, not yet planned
**Scope:** `@realm/crm`, `@realm/payments`, new `@realm/google-reviews`, `apps/puchkaman`, `apps/tiffin-grab`

## Problem

Realm has no plugin system. What looks like one is three unrelated conventions
sharing a JSONB column:

- **Clover** — hand-wired in `@realm/clover`, its own install/uninstall functions,
  state at `integrations_config.clover`.
- **Payment methods** (tiffin-grab only) — a local `PaymentPluginDef` array in
  `apps/tiffin-grab/app/(dashboard)/dashboard/settings/integrations/registry.ts`,
  state in a *different* column, `payment_config.methods[]`.
- **OptimoRoute** (tiffin-grab only) — its own key in the `integrations_config`
  blob, no Integrations card at all.

The only shared piece is the presentational shell `IntegrationPluginCard` in
`@realm/crm`. Adding a plugin today means hand-editing `plugins-catalog.tsx`,
`settings/page.tsx`, and `app-sidebar.tsx` — in both apps. Google Reviews is
plugin #3, so this is the point where the copy-paste cost is paid for good.

Separately, puchkaman's public homepage advertises social proof that is entirely
fabricated: `const REVIEWS` at `apps/puchkaman/app/(marketing)/page.tsx:48` plus
hardcoded `4.8` / `119+` counts at `:131`, `:145`, `:191`, `:296`.

## Goals

1. A real plugin contract in `@realm/crm` that both apps compose independently.
2. Payments modelled as **one** plugin containing **providers**, so Stripe and
   Clover Payment can be added later without new Integrations cards.
3. A `@realm/google-reviews` plugin that (a) renders real Google reviews on the
   public sites and (c) nudges customers to leave one, once per customer.

## Non-goals

Explicitly out of scope for this spec:

- Stripe payment provider.
- Retrofitting puchkaman's existing Clover iframe checkout behind the provider
  interface.
- Review replies / admin review inbox (the Business Profile API feature).
- Re-ask cadence, A/B testing, or per-order review nudges.
- Any database rebuild. Both apps are in production with real orders and
  payments; every migration in this spec is additive.

## Key decision: the extension point already exists

`integrationsConfigSchema` in `packages/clover/src/config.ts:87` is declared
`.loose()`. That is load-bearing: any plugin may add a top-level key and it
survives Clover's saves. OptimoRoute already relies on it
(`apps/tiffin-grab/lib/services/optimoroute/config.ts:7`).

Consequence: **plugin configuration needs no migration.** Only the review nudge
needs relational storage, and that is two nullable columns.

The trade-off is honest: there is no referential integrity in a JSONB blob, so
"is this plugin installed" is always a runtime zod parse, never a DB constraint.
That is acceptable for admin-toggled configuration and is the existing
convention.

---

## Section 1 — Plugin contract (`@realm/crm`)

### Files

`packages/crm/src/plugin.ts` — **client-safe**, no server imports:

```ts
export type PluginMeta = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  settingsHref?: string; // revealed once installed
};
```

`packages/crm/src/plugin.server.ts` — **server-only**:

```ts
export type PluginStatus = { installed: boolean; statusLabel?: string };

export type PluginServer = {
  id: string;
  status(): Promise<PluginStatus>;
  install(): Promise<void>;
  uninstall(): Promise<void>;
  requires?: string[];
  nav?(s: PluginStatus): NavSection[];
};

export type PluginRegistry = readonly PluginServer[];

export function resolveStatuses(r: PluginRegistry): Promise<Record<string, PluginStatus>>;
export function blockedBy(r: PluginRegistry, id: string, statuses: Record<string, PluginStatus>): string[];
export function dependents(r: PluginRegistry, id: string): string[];
```

`packages/crm/src/plugin-catalog.tsx` — **client**. Props: `metas: PluginMeta[]`,
`statuses: Record<string, PluginStatus>` (plain JSON), and the install action.
Renders the existing `IntegrationPluginCard` in a loop. Plugins needing a richer
card (Clover's connect/disconnect panel) pass `children` keyed by plugin id.

### Why the meta/server split is mandatory

`icon` is a `LucideIcon`, i.e. a function. Functions cannot cross the React
Server Component server-to-client props boundary. The client catalog therefore
imports `PluginMeta` values **directly** as a module; the server page ships only
plain JSON statuses, which the client zips against the meta it already has. This
is exactly why today's `PAYMENT_PLUGIN_CATALOG` lives in a module the client
component imports. Any design that puts `icon` and `install()` on one object
breaks at runtime with a serialization error, and `tsc` will not catch it.

### Per-app registries

Each app owns `lib/plugins.server.ts`:

```ts
// apps/puchkaman/lib/plugins.server.ts
export const PLUGINS: PluginRegistry = [
  cloverPlugin(integrationsConfigStore),
  googleReviewsPlugin(integrationsConfigStore),
];

// apps/tiffin-grab/lib/plugins.server.ts
export const PLUGINS: PluginRegistry = [
  paymentsPlugin(appSettingsStore),
  googleReviewsPlugin(integrationsConfigStore),
];
```

tiffin-grab never imports `@realm/clover`. **Absence is the gating** — no feature
flags, no dead branches.

### One generic action replaces five

```ts
export async function setPluginInstalledAction(id: string, installed: boolean) {
  await requireAdmin();
  const p = PLUGINS.find((x) => x.id === id);
  if (!p) return { error: "Unknown plugin" };
  if (installed && blockedBy(PLUGINS, id, await resolveStatuses(PLUGINS)).length) {
    return { error: "Install its prerequisites first" };
  }
  installed ? await p.install() : await p.uninstall();
  await recordAudit({ entity: "integrations", entityPublicId: id /* ... */ });
  revalidatePath("/dashboard/settings/integrations");
}
```

Server actions **return** errors rather than throwing — throwing yields a
digest-only crash with no usable message.

This centralises `requireAdmin()` + `recordAudit()` + `revalidatePath()`, which
are re-implemented per plugin today. It incidentally fixes a real bug:
tiffin-grab's Clover actions (`.../integrations/clover-actions.ts`) currently
record no audit at all, while puchkaman's do.

### `requires` is checked in both directions

- **Forward** (`blockedBy`) — greys out install until prerequisites are met.
- **Backward** (`dependents`) — uninstalling Clover must warn that Clover Payment
  dies with it.

The backward check is the one that matters operationally. Without it you get a
payment provider pointing at revoked OAuth tokens, which fails at charge time in
front of a customer rather than at config time in front of an admin.

### Known unexercised surface

`PluginServer.requires` and `PaymentProviderDef.requiresPlugin` (Section 2) have
**no consumer in this spec**. They exist because the Clover Payment provider in
the follow-on spec is their first user. They are covered by the pure unit test so
they are not simultaneously dead and untested. If a reviewer prefers, they can be
cut and reintroduced with their first consumer at no loss.

### Verification

`resolveStatuses` / `blockedBy` / `dependents` are pure over a fake registry —
one vitest file, no database.

---

## Section 2 — Payments becomes one plugin (structure only)

### Card consolidation

tiffin-grab's Integrations page renders three cards today (`e-Transfer`, `Cash`,
`Manual`). They become three **providers** inside a single `Payments` plugin
card. tiffin-grab's Integrations page becomes `[Payments, Google Reviews]`.

Providers are enabled under **Settings → Payments**, which appears once the
Payments plugin is installed — matching the existing preference that payment
method settings only appear after a payment plugin is added.

### State split, deliberately

| What | Where | Changed? |
|---|---|---|
| Plugin installed | `integrations_config.payments = { installed: boolean }` | new key, no migration |
| Provider rows | `payment_config.methods[]` | **unchanged** |

Keeping providers in `payment_config` means zero data migration and no change to
any code that reads payment methods at checkout.

### Backfill without a migration

On read, `installed` defaults to `methods.length > 0`. Existing tiffin-grab
production data therefore reports the Payments plugin as already installed,
correctly, with nothing written. The first explicit install/uninstall persists
the flag.

### New in `@realm/payments`

```ts
export type PaymentProviderDef = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  requiresPlugin?: string; // e.g. "clover"; unexercised until Clover Payment lands
  seed(): PaymentMethodConfig;
};

export const PAYMENT_PROVIDERS: readonly PaymentProviderDef[]; // etransfer, cash, manual
```

This is `PAYMENT_PLUGIN_CATALOG` moved out of the app and into the package,
renamed to say what it is. `install` / `uninstall` keep their exact current
semantics: append seed row / filter by id.

### puchkaman is untouched

puchkaman has no `payment_config` column, and its Clover checkout
(`apps/puchkaman/lib/clover/public-ordering.ts`) does not go through payment
methods. The Payments plugin is tiffin-grab-only in this spec.

### Verification

- Vitest asserting install/uninstall of each existing provider produces a
  `payment_config.methods` value identical to what today's code produces. This is
  the regression gate on the money path.
- The backfill rule: `methods.length > 0` implies installed.

---

## Section 3 — Google Reviews plugin

New package `@realm/google-reviews`, three entrypoints mirroring `@realm/clover`:
`.` (server), `./plugin` (meta), `./ui` (client).

### Config

```ts
googleReviewsConfigSchema = z.object({
  installed: z.boolean().default(false),
  placeId: z.string().optional(),
  provider: z.enum(["places", "business-profile"]).default("places"),
});
```

Stored at `integrations_config.googleReviews` — the `.loose()` blob, **no
migration**. The API key is env-only (`GOOGLE_PLACES_API_KEY`), following the
OptimoRoute precedent: secrets in env, non-secret config in the blob.

Settings → Google Reviews (visible once installed) takes the `place_id` and
offers a "Test connection" preview.

### Provider interface — the seam between (A) now and (B) later

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
  attributionUrl: string;
};

export type ReviewsProvider = {
  id: "places" | "business-profile";
  fetchSummary(placeId: string): Promise<ReviewsSummary>;
};
```

`placesProvider` ships now: Places API returns the rating, total rating count,
and up to **5** reviews, with no pagination. It needs only an API key.

`businessProfileProvider` slots in when Google grants Business Profile API
access. That grant is a separate application, reviewed by Google, and takes days
to weeks — running Google Ads does not confer it. It returns all reviews and is
also what unlocks replying (feature B). Nothing above the interface changes when
it lands.

### Caching

Fetched server-side with `fetch(..., { next: { revalidate: 21600 } })` — 6 hours,
Next's own fetch cache. **No reviews table; no review text persisted.**

Uncertainty stated deliberately: Google Maps Platform terms restrict caching
Places content, with `place_id` explicitly exempt and cacheable indefinitely. The
current wording around limited temporary caching of other fields has not been
verified for this spec, so the design does not depend on it. A short-lived
in-process cache with no persistence is safe under any reading, costs nothing,
and keeps ratings fresh. Attribution — labelling the source as Google and linking
to the listing — is unambiguously required and is rendered.

### Display (A)

`getReviewsSummary()` is the shared export. **Rendering stays per-app.**

- **puchkaman** — homepage is neo-brutalist with hand-built review cards already.
  This phase swaps `const REVIEWS` (`app/(marketing)/page.tsx:48`) for the server
  call and removes the four hardcoded counts at `:131`, `:145`, `:191`, `:296`.
- **tiffin-grab** — its own component in its own design language.

Sharing the data and not the markup is intentional. The two public surfaces have
deliberately different design languages (see
`docs/design/prototype-generation.md`); one component satisfying both collapses
into a variant prop that serves neither.

### Failure mode

If the API errors, the key is missing, or no `place_id` is configured, the
section renders **nothing**. Never a zero rating, never a stale fallback number.
A social-proof block silently showing wrong numbers is worse than no block.

### Nudge (C) — email and in-app, once per customer

Two additive nullable columns on `users`, in each app:

| Column | Meaning |
|---|---|
| `review_nudge_sent_at` | stamped when the email is dispatched |
| `review_nudge_done_at` | stamped on click or dismiss; suppresses **both** channels permanently |

**Trigger:** when a delivery/order transitions to `delivered`, if both columns are
null, send the email via `@realm/email` (SES) and stamp `sent_at`. The in-app card
renders in the customer app under the same condition and hides once `done_at` is
set.

**Link target:** `https://search.google.com/local/writereview?placeid=<placeId>`.

**Deliberate simplification:** the in-app card links through
`/api/reviews/nudge/click`, which stamps `done_at` from the authenticated session
and redirects — so in-app click-through is tracked. The **email** link goes
directly to Google with no tracking, because tracking an unauthenticated
recipient requires signed tokens. A `ponytail:` comment will name the ceiling;
add HMAC'd email tracking if the funnel number turns out to matter.

**Why columns and not a table:** "once per customer, forever" is 1:1 with the
user, so a join table would hold zero or one row per user — pure overhead plus an
extra query on a per-request render. If the requirement later becomes "re-ask
after 12 months" or per-order nudges, the cardinality becomes 1:N and a table
becomes correct. Two nullable timestamps are cheap to add and cheap to drop.

### Verification

- Provider unit test against a recorded Places JSON fixture: parsing, plus the
  error/empty path returning nothing rather than zeros.
- Nudge eligibility as a pure function over the two timestamps.

---

## Section 4 — Build sequence, risks, open items

### Order

Each step green before the next.

1. **Contract** — `@realm/crm` plugin files plus pure unit tests. Nothing consumes
   it yet; zero behaviour change.
2. **Migrate existing plugins onto it** — tiffin-grab payments first (three cards
   into one Payments plugin with providers), then puchkaman Clover. Regression
   tests assert install/uninstall store identical config to today.
3. **`@realm/google-reviews`** — config schema, `placesProvider`, plugin server
   half, settings panel, install/uninstall. Invisible until installed.
4. **Display (A)** — puchkaman homepage swaps fabricated reviews and counts for
   live data; tiffin-grab surface added.
5. **Nudge (C)** — additive migration (2 columns per app), SES email, in-app card,
   click route.

Steps 1–3 ship nothing user-visible and can land before the Places API key
exists.

### Risks, worst first

- **Payments regression (step 2)** — the money path. Mitigated by
  identical-output tests before and after, and by leaving `payment_config` shape
  and every checkout reader untouched. This step warrants the hardest review.
- **RSC boundary** — `icon` is a function; the meta/server split exists to stop it
  crossing. A mistake is a runtime serialization error, invisible to `tsc`.
- **`transpilePackages`** — `@realm/google-reviews/ui` is client-consumed and must
  be added to both apps' `next.config.ts`. Per `AGENTS.md` this is a class of bug
  `tsc` cannot catch, alongside stripped `"use client"` directives and the
  `Component.Skeleton` named-export trap. Both by-eye checks apply.
- **Silent-wrong display** — covered by rendering nothing on failure.

### Verify contract

`pnpm turbo typecheck && pnpm turbo test` after each step, plus the two by-eye
client-component checks named above.

### Open items requiring the operator

None block steps 1–3.

1. Enable Places API and billing on a Google Cloud project; produce
   `GOOGLE_PLACES_API_KEY`, restricted to that API and to server IPs.
2. Supply the `place_id` for each business — puchkaman and tiffin-grab.
3. Submit the Business Profile API access request now, so the review clock runs
   during the build. It is the prerequisite for feature B.

### Follow-on specs

- Clover Payment provider (retrofit puchkaman's live Clover checkout behind
  `PaymentProviderDef`).
- Stripe payment provider.
- Google review replies / admin review inbox, on `businessProfileProvider`.
