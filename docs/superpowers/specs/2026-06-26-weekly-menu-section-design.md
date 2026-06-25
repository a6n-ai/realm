# Weekly Menu Section — Design

**Date:** 2026-06-26
**Status:** Approved (pending written-spec review)
**Author:** brainstormed with hrithikraj1997@gmail.com

## Problem

Tiffin Grab publishes a weekly tiffin menu as a Canva PDF poster
(see `tiffingrab.ca/.../Tiffin-Menu-*.pdf`). The poster format is:

- Title: `Tiffin Menu - <start date> - <end date>` (one week).
- Six columns: **Mon, Tue, Wed, Thu, Fri** + **WEEKENDS** (Sat+Sun merged).
- Each weekday lists **3 dishes** (flat list of names); weekends list **2**.
- Dishes mix veg/nonveg. No lunch/dinner slots, no portions, no per-dish detail.

The existing in-app menu (`/dashboard/menus`, `menu.ts`) over-models this: it
has meal *slots* (lunch/dinner), `isDefault`, per-person `meal_selections`, and
order cutoffs — none of which appear in the real weekly poster. It does not
match how the business actually publishes menus.

We want an in-app **weekly menu section** that (a) lets admins build the week's
poster matching the real format, (b) supports **multiple plans** (Tiffin now,
Healthy later), (c) publishes the poster to the **marketing website** (homepage
+ dedicated route), and (d) supports **PDF download**. Built so customer
**ordering** can attach in a later phase without rework.

## Scope

**Phase 1 (this spec):** Admin builds + publishes weekly menus per plan;
poster renders on marketing site; react-pdf download; puppeteer email PDF
(pending mailer — see Email gap); customizable plan settings.

**Phase 2 (later, not built now):** Customers order/select dishes off a
released week, feeding `meal_selections` + order cutoff. Schema is designed so
this attaches cleanly.

**Out of scope:** Nutrition/calorie data, the "Healthy" plan's content.

## Decisions

- **Approach A — extend menu tables, add a Plan dimension.** Rejected: separate
  poster tables (double maintenance) and JSON-blob-per-week (breaks phase-2
  ordering, which needs real `dish_id` rows).
- **Marketing placement:** current-week poster on the **homepage** *and* a
  **dedicated route**.
- **Old slot-based builder:** **replaced** by the poster-style builder. Existing
  `menu_weeks`/`menu_items` data is backfilled into the seeded "Tiffin" plan so
  nothing is orphaned (required by the new NOT NULL `plan_id`).
- **PDF — two paths (deliberate split):**
  - **Email attachment → puppeteer** (`puppeteer-core` + `@sparticuz/chromium-min`).
    Renders the *actual* marketing poster route to a brand-exact PDF (bg images,
    overlap, photos, web fonts). Runs ~once/week, so chromium cold-start cost is
    fine. This is the customer-facing artifact.
  - **Website "Download PDF" → `@react-pdf/renderer`.** Light, cheap, no chromium
    on the hot interactive path. Renders a **simpler branded dish-list** (NOT the
    Canva poster — react-pdf can't do bg images/overlap). Accepted tradeoff: the
    download looks plainer than the emailed poster.
  - Two layouts; they can drift. Documented and accepted.
  - **Abstracted behind one contract** (see Services): both paths implement an
    abstract `WeeklyMenuPdfRenderer`, so callers (email job, download route)
    depend on the interface, not the engine.

## Data model

New table `menu_plans`:

| column      | type                  | notes                                  |
|-------------|-----------------------|----------------------------------------|
| (updatable) | `mpl` prefix          | commons `updatableColumns`             |
| `key`       | text unique           | `tiffin`, `healthy`, …                 |
| `label`     | text                  | display name                           |
| `active`    | boolean default true  | hide a plan without deleting           |
| `sortOrder` | integer default 0     | ordering in pickers / marketing        |
| `config`    | jsonb                 | see below                              |

`config` shape (typed, validated):

```ts
type PlanConfig = {
  columns: { label: string; days: DayOfWeek[]; dishCount: number }[];
  theme: { accent: string; titlePrefix: string };
};
```

Tiffin default `config`:

```ts
{
  columns: [
    { label: "Monday",   days: ["mon"], dishCount: 3 },
    { label: "Tuesday",  days: ["tue"], dishCount: 3 },
    { label: "Wednesday",days: ["wed"], dishCount: 3 },
    { label: "Thursday", days: ["thu"], dishCount: 3 },
    { label: "Friday",   days: ["fri"], dishCount: 3 },
    { label: "Weekends", days: ["sat","sun"], dishCount: 2 },
  ],
  theme: { accent: "#F0820A", titlePrefix: "Tiffin Menu" },
}
```

`dishCount` is **soft guidance** (UI nudges, doesn't hard-block) — admins can
add fewer/more without an error.

Changes to existing tables:

- `menu_weeks` += `planId bigint NOT NULL REFERENCES menu_plans(id)`. Unique
  constraint changes from `weekStart` to **`(plan_id, week_start)`**.
- `menu_items` += `position integer NOT NULL DEFAULT 0` (poster ordering within a
  column). `slot` stays in the schema but the builder writes a single implicit
  slot value `"main"` for poster-only plans, keeping phase-2 keys clean.
- `meal_selections`: **unchanged** (phase 2). Weekend dishes are stored under
  `sat`; phase-2 weekend selection maps both sat+sun to the merged column's
  dishes (documented for the phase-2 implementer).

**Migration:** Drizzle `db:generate` (squashed baseline convention). Seed a
`tiffin` plan; backfill any existing `menu_weeks.plan_id` to it before the NOT
NULL constraint applies.

## Services

`menu.service.ts` (extends commons abstract services, subclass overrides per
convention):

- Plan CRUD via a `MenuPlansService` (commons `UpdatableRepository`); `config`
  validated against a Zod/typed schema before write.
- Week + items: keep `upsertWeek`/`addItem`/`removeItem`/`weekWithItems`,
  re-scoped by `planId`; add `reorderItems(weekId, day, orderedIds)` writing
  `position`; `release` unchanged.
- A cached `getPublishedWeek(planKey, weekStart?)` for marketing (TieredCache,
  evict on release — mirrors `app-settings.service` and the catalog snapshot
  cache). Returns the current released week's poster data.

### PDF renderer abstraction

One abstract base, two concrete engines, so callers depend on the contract not
the engine (consistent with the commons "subclass + override" convention):

```ts
type WeeklyMenuPdfInput = {
  plan: MenuPlan;
  week: PublishedWeek;        // resolved poster data from getPublishedWeek
};

abstract class WeeklyMenuPdfRenderer {
  // template method: fetch -> render -> return bytes
  async generate(planKey: string, weekStart?: string): Promise<Uint8Array> {
    const input = await this.resolve(planKey, weekStart); // shared
    return this.render(input);                             // engine-specific
  }
  protected resolve = getPublishedWeek;                    // shared, overridable
  protected abstract render(input: WeeklyMenuPdfInput): Promise<Uint8Array>;
}
```

Concrete subclasses:

- `PuppeteerPdfRenderer extends WeeklyMenuPdfRenderer` — `render()` launches
  `@sparticuz/chromium-min`, navigates to the poster route (or sets its HTML),
  `page.pdf()`. Used by the **email** path.
- `ReactPdfRenderer extends WeeklyMenuPdfRenderer` — `render()` builds the
  `@react-pdf/renderer` `<Document>` (simpler branded dish-list) and returns
  bytes. Used by the **download** route.

Callers (email job, `/menu/weekly/pdf`) hold a `WeeklyMenuPdfRenderer` and call
`generate()` — swappable, testable, single resolve path.

## UI

**Admin `/dashboard/menus` (rebuilt, poster-style):**

- Plan picker (typed `Select`) → week picker / "new week" (date input, Monday).
- One card per `config.columns` entry. Each card: dish list with veg/nonveg dot,
  add-dish (typed `Select` from active dishes — no free-text, TD-3), remove,
  drag-reorder (writes `position`). Soft count hint from `dishCount`.
- Draft → **Release** action.
- **Live poster preview** mirroring the marketing render (pattern from the
  catalog live-preview commit `7dda875`).
- **Settings** panel for plan `config`: columns (label/days/count), theme
  (accent color, title prefix) — all typed controls.

**Marketing:**

- New `WeeklyMenuPoster` component (orange Canva look: brand header, day
  columns, dish lists, footer with phone/site). Solid colors only — no text
  effects (per `no-text-effects` memory).
- Rendered on **homepage** (section) and a **dedicated route**
  (`/menu/weekly`), both reading `getPublishedWeek("tiffin")`. Static + ISR /
  revalidate-on-release (matches `/menu` page caching).
- **Download PDF** button → route `/menu/weekly/pdf` backed by
  `ReactPdfRenderer.generate()`. Streams `application/pdf` (simpler branded
  dish-list, accent from plan `config.theme`).

## Email

Admin action "Email this week's menu" generates the brand-exact poster PDF via
`PuppeteerPdfRenderer.generate()` and attaches it to the outgoing email.
One-off cadence → chromium cost acceptable. `requireAdmin`-guarded.

> **Gap / dependency:** there is **no mail-sending infrastructure** in the repo
> today (`email` is only a stored contact field; no provider, no transport).
> The email feature requires adding a mail provider (Resend recommended for
> Vercel — simple attachment API; nodemailer/SMTP as fallback) behind a small
> `mailer` service. Recipient list (all active subscribers? a test address?) is
> **TBD — needs your input before the email path is planned.** The PDF
> abstraction and puppeteer renderer can be built independently of this; email
> wiring is the last step and may slip to its own slice if the recipient model
> is unsettled.

## Error handling

- Plan `config` validated before persist; invalid JSON rejected with
  `ValidationError`.
- Releasing a week with empty columns warns but is allowed (admin choice).
- Marketing render: no released week → graceful "menu coming soon" empty state,
  not a crash.
- Admin actions are `requireAdmin`-guarded server actions (existing pattern),
  `revalidatePath` on marketing + dashboard.

## New dependencies

- `puppeteer-core` + `@sparticuz/chromium-min` (email PDF). Add
  `serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min"]` to
  `next.config.ts`.
- `@react-pdf/renderer` (download PDF).
- Mail provider (`resend` recommended) — only when the email path is built.

## Testing

- Service tests against the live seeded Postgres (harness convention,
  `live-db-test-harness`): plan CRUD + config validation; week scoped by plan;
  reorder writes `position`; `getPublishedWeek` returns released-only and is
  cache-evicted on release; weekend-day storage.
- Backfill migration: existing weeks land on the tiffin plan.
- Marketing: empty-state when no released week.
- PDF abstraction: `WeeklyMenuPdfRenderer.generate()` shared `resolve` path
  tested once; each engine's `render()` smoke-tested (puppeteer produces a
  non-empty `application/pdf`; react-pdf doc builds for a sample week). Engine
  launch can be mocked where chromium isn't available in CI.

## Phase-2 readiness (not built)

`meal_selections` + cutoff already model ordering. A released week's
`menu_items` (real `dish_id` rows, with `slot="main"`) are the orderable units;
weekend selection resolves both sat+sun to the merged column. No phase-1 schema
choice blocks this.
