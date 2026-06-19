# Subsystem F Implementation Plan — Marketing Website

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-page public marketing site (`(marketing)` route group) that funnels visitors into `/subscribe`, renders Menu/Pricing from the live catalog, and turns the Contact form into a `website`-sourced inquiry.

**Architecture:** A new `(marketing)` App Router route group with a shared header/footer layout. The landing page moves to `app/(marketing)/page.tsx` (replacing the Next.js starter `app/page.tsx`). Menu/Pricing are server components reading the existing `loadCatalogSnapshot()`. Contact posts to a public server action that reuses `matchZone` + `isValidCaPhone` and `inquiriesService.create`. Theme reuses existing shadcn/Geist tokens — no new design system.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Tailwind v4 + shadcn/ui, Drizzle/Postgres (read-only via existing loader), Vitest.

## Global Constraints

- **Next.js 16:** route groups don't change the URL; `params` is a Promise; read `node_modules/next/dist/docs/` before framework code. Only ONE page may map to `/` — deleting `app/page.tsx` when adding `app/(marketing)/page.tsx` is mandatory.
- **Reuse, don't rebuild:** Menu/Pricing use `loadCatalogSnapshot()` (`apps/web/lib/catalog/load.ts`, already filters `active=true`). Contact reuses `matchZone` (`apps/web/lib/catalog/postal.ts`), `isValidCaPhone` (`apps/web/lib/services/users-contact.ts`), and `inquiriesService.create` (`apps/web/lib/services/inquiries.service.ts`).
- **Theme:** existing shadcn components in `apps/web/components/ui/*` + Geist tokens. No new colors/fonts this slice (UI revamp deferred).
- **Inquiry contract:** `source` must be `"website"` (enum already includes it); waitlist state goes in the existing `inquiries.prefs` jsonb as `{ servedZone: string|null, waitlisted: boolean }`. No schema change.
- **TypeScript everywhere; no unnecessary comments** (only the non-obvious *why*). `rg`/`fd` over grep/find. Commit messages plain, NO `Co-Authored-By` trailer.
- **DB for tests/build:** local Postgres at `DATABASE_URL` (default `postgres://lawbringr@localhost:5432/tiffin`). The session uses the same DB for dev and tests, so `pnpm test` wipes seeded users/inquiries — reseed (`pnpm db:seed:catalog`, `pnpm db:seed:admin`) afterward if doing manual checks.
- **Vitest + session services:** a test importing anything that transitively imports `@/lib/auth` must `vi.mock("@/lib/auth", () => ({ auth: async () => null }))` (NextAuth can't eval under vitest's node env) and import the subject via `await import(...)` after the mock.
- **Verify command (root):** `pnpm test && pnpm typecheck && pnpm build`.

---

## File structure

```
apps/web/
├─ app/
│  ├─ page.tsx                         # DELETE (starter) — landing moves into (marketing)
│  └─ (marketing)/
│     ├─ layout.tsx                    # SiteHeader + SiteFooter wrapper
│     ├─ page.tsx                      # Landing (/)
│     ├─ how-it-works/page.tsx
│     ├─ about/page.tsx
│     ├─ faq/page.tsx
│     ├─ menu/page.tsx                 # live catalog (server)
│     ├─ pricing/page.tsx              # live catalog (server)
│     └─ contact/
│        ├─ page.tsx
│        ├─ actions.ts                 # createWebsiteInquiry (tested)
│        └─ contact-form.tsx           # client
└─ components/marketing/
   ├─ site-header.tsx                  # client (usePathname, mobile sheet)
   ├─ site-footer.tsx
   ├─ hero.tsx
   ├─ section.tsx
   └─ cards.tsx                        # FeatureCard / StepCard / MealCard / PriceCard
```

---

## Task 1: Marketing shell + landing page

**Files:**
- Create: `apps/web/components/marketing/site-header.tsx`, `site-footer.tsx`, `section.tsx`, `hero.tsx`
- Create: `apps/web/app/(marketing)/layout.tsx`, `apps/web/app/(marketing)/page.tsx`
- Delete: `apps/web/app/page.tsx`

**Interfaces:**
- Produces: `<SiteHeader />`, `<SiteFooter />`, `<Section>` (props `{ id?, className?, children }`), `<Hero />`. The `(marketing)/layout.tsx` wraps all marketing pages with header + footer. Landing served at `/`.

- [ ] **Step 1: Site header** — `apps/web/components/marketing/site-header.tsx`

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UtensilsCrossedIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const LINKS = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/menu", label: "Menu" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
            <UtensilsCrossedIcon className="size-4" />
          </span>
          Tiffin Grab
        </Link>
        <nav className="hidden items-center gap-5 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-sm ${pathname === l.href ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Button asChild variant="ghost" size="sm"><Link href="/login">Sign in</Link></Button>
          <Button asChild size="sm"><Link href="/subscribe">Start subscription</Link></Button>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Site footer** — `apps/web/components/marketing/site-footer.tsx`

```tsx
import Link from "next/link";

const ZONES = "Etobicoke · Mississauga · Brampton · Toronto · Scarborough · Markham · Richmond Hill · North York · Vaughan · Oakville · East York";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto grid max-w-6xl gap-6 px-4 py-10 text-sm sm:grid-cols-3">
        <div>
          <div className="text-foreground font-semibold">Tiffin Grab</div>
          <p className="mt-2">Customizable home-style tiffin delivery across the GTA.</p>
        </div>
        <div>
          <div className="text-foreground font-medium">Explore</div>
          <ul className="mt-2 space-y-1">
            <li><Link href="/how-it-works" className="hover:text-foreground">How it works</Link></li>
            <li><Link href="/menu" className="hover:text-foreground">Menu</Link></li>
            <li><Link href="/pricing" className="hover:text-foreground">Pricing</Link></li>
            <li><Link href="/contact" className="hover:text-foreground">Contact</Link></li>
          </ul>
        </div>
        <div>
          <div className="text-foreground font-medium">Areas served</div>
          <p className="mt-2">{ZONES}</p>
        </div>
      </div>
      <div className="text-muted-foreground border-t py-4 text-center text-xs">
        © {2026} Tiffin Grab. All rights reserved.
      </div>
    </footer>
  );
}
```

(Use the literal `2026` — `new Date()` is fine in a server component, but a constant avoids a needless dynamic render; the spec defers anything fancier.)

- [ ] **Step 3: Section + Hero primitives** — `apps/web/components/marketing/section.tsx`

```tsx
import type { ReactNode } from "react";

export function Section({ id, className = "", children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-6xl px-4 py-16 ${className}`}>
      {children}
    </section>
  );
}
```

`apps/web/components/marketing/hero.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "./section";

export function Hero() {
  return (
    <Section className="flex flex-col items-center gap-6 py-24 text-center">
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Home-style tiffins, built exactly how you eat.
      </h1>
      <p className="text-muted-foreground max-w-xl text-lg">
        Pick your nutrition baseline, meal size, schedule, and duration. Fresh, customizable
        meals delivered across the Greater Toronto Area.
      </p>
      <div className="flex gap-3">
        <Button asChild size="lg"><Link href="/subscribe">Start your plan</Link></Button>
        <Button asChild size="lg" variant="outline"><Link href="/how-it-works">See how it works</Link></Button>
      </div>
    </Section>
  );
}
```

- [ ] **Step 4: Marketing layout** — `apps/web/app/(marketing)/layout.tsx`

```tsx
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/marketing/site-header";
import { SiteFooter } from "@/components/marketing/site-footer";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
```

- [ ] **Step 5: Landing page + delete starter** — delete `apps/web/app/page.tsx`, create `apps/web/app/(marketing)/page.tsx`

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Hero } from "@/components/marketing/hero";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = {
  title: "Tiffin Grab — Customizable tiffin delivery in the GTA",
  description: "Build and subscribe to home-style, customizable tiffin meal plans delivered across the Greater Toronto Area.",
};

const VALUES = [
  { title: "You customize everything", body: "Nutrition baseline, meal size, schedule, quantity, and duration — your plan, your way." },
  { title: "Fresh & home-style", body: "Balanced thalis and bowls cooked the way you'd make them at home." },
  { title: "Across the GTA", body: "Delivery to eleven regions, with slot windows matched to your postal code." },
];

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Section className="grid gap-6 sm:grid-cols-3">
        {VALUES.map((v) => (
          <div key={v.title} className="rounded-lg border p-6">
            <h3 className="font-medium">{v.title}</h3>
            <p className="text-muted-foreground mt-2 text-sm">{v.body}</p>
          </div>
        ))}
      </Section>
      <Section className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-semibold">Ready to build your tiffin?</h2>
        <Button asChild size="lg"><Link href="/subscribe">Start your plan</Link></Button>
      </Section>
    </>
  );
}
```

- [ ] **Step 6: Verify** — Run (root): `pnpm build`. Expected: build succeeds; `/` is listed and renders within the marketing layout (no duplicate-root-route error). If the build reports a route conflict, confirm `apps/web/app/page.tsx` was deleted.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/marketing apps/web/app/\(marketing\)/layout.tsx apps/web/app/\(marketing\)/page.tsx
git rm apps/web/app/page.tsx
git commit -m "feat(marketing): site shell (header/footer/layout) + landing page"
```

---

## Task 2: Static content pages (how-it-works, about, faq)

**Files:**
- Create: `apps/web/app/(marketing)/how-it-works/page.tsx`, `about/page.tsx`, `faq/page.tsx`
- Create: `apps/web/components/marketing/cards.tsx` (StepCard used here; Meal/Price cards added in Tasks 3–4)

**Interfaces:**
- Consumes: `<Section>` (Task 1).
- Produces: `<StepCard>` (`{ n: number; title: string; body: string }`).

- [ ] **Step 1: StepCard** — `apps/web/components/marketing/cards.tsx`

```tsx
export function StepCard({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="rounded-lg border p-6">
      <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-semibold">{n}</div>
      <h3 className="mt-3 font-medium">{title}</h3>
      <p className="text-muted-foreground mt-1 text-sm">{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: How it works** — `apps/web/app/(marketing)/how-it-works/page.tsx`

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/marketing/section";
import { StepCard } from "@/components/marketing/cards";

export const metadata: Metadata = { title: "How it works — Tiffin Grab", description: "Build a plan in four steps, check out, and activate your tiffin subscription." };

const STEPS = [
  { n: 1, title: "Nutrition baseline", body: "Choose Pure Vegetarian, Halal Non-Veg, or a Veg & Non-Veg mix." },
  { n: 2, title: "Build your bundle", body: "Pick a meal size and tier; see calories, protein, carbs, and fat." },
  { n: 3, title: "Schedule & quantity", body: "Set frequency, daily quantity, weekend add-ons, and student discount." },
  { n: 4, title: "Duration & checkout", body: "Choose a commitment length for loyalty savings, then confirm." },
];

export default function HowItWorksPage() {
  return (
    <Section className="space-y-8">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">How it works</h1>
        <p className="text-muted-foreground mt-2">From baseline to your first delivery in a few guided steps.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => <StepCard key={s.n} {...s} />)}
      </div>
      <Button asChild size="lg"><Link href="/subscribe">Start your plan</Link></Button>
    </Section>
  );
}
```

- [ ] **Step 3: About** — `apps/web/app/(marketing)/about/page.tsx`

```tsx
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "About — Tiffin Grab", description: "Why Tiffin Grab exists: customizable, home-style meals for the GTA." };

export default function AboutPage() {
  return (
    <Section className="max-w-2xl space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight">About Tiffin Grab</h1>
      <p className="text-muted-foreground">
        Tiffin Grab brings home-style, customizable meals to the Greater Toronto Area. We believe
        a good tiffin should fit your diet, your schedule, and your budget — not the other way
        around. Every plan is built by you: nutrition baseline, meal size, delivery rhythm, and
        commitment length.
      </p>
      <p className="text-muted-foreground">
        We cook balanced thalis and bowls in small batches and deliver them on slot windows matched
        to your neighbourhood across eleven GTA regions.
      </p>
    </Section>
  );
}
```

- [ ] **Step 4: FAQ** — `apps/web/app/(marketing)/faq/page.tsx`

```tsx
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "FAQ — Tiffin Grab", description: "Answers to common questions about plans, delivery, and customization." };

const FAQS = [
  { q: "Where do you deliver?", a: "Across eleven GTA regions. Enter your postal code at checkout to see your slot window — if we don't serve your area yet, you can join the waitlist." },
  { q: "Can I customize my meals?", a: "Yes. You choose a nutrition baseline, meal size, schedule, daily quantity, weekend add-ons, and commitment length." },
  { q: "How does pricing work?", a: "Pricing is built from your selections: meal base price × quantity × billable days, plus add-ons, minus courier, student, and loyalty discounts. See the Pricing page." },
  { q: "Is there a student discount?", a: "Yes — a 10% student discount can be applied during plan building." },
  { q: "How do I pay?", a: "Checkout currently uses a simulated payment while we finish onboarding our payment provider." },
];

export default function FaqPage() {
  return (
    <Section className="max-w-2xl space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">Frequently asked questions</h1>
      <dl className="space-y-5">
        {FAQS.map((f) => (
          <div key={f.q}>
            <dt className="font-medium">{f.q}</dt>
            <dd className="text-muted-foreground mt-1 text-sm">{f.a}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}
```

- [ ] **Step 5: Verify** — Run (root): `pnpm build`. Expected: `/how-it-works`, `/about`, `/faq` build as static routes.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(marketing\)/how-it-works apps/web/app/\(marketing\)/about apps/web/app/\(marketing\)/faq apps/web/components/marketing/cards.tsx
git commit -m "feat(marketing): how-it-works, about, and FAQ pages"
```

---

## Task 3: Live Menu page

**Files:**
- Create: `apps/web/app/(marketing)/menu/page.tsx`
- Modify: `apps/web/components/marketing/cards.tsx` (add `MealCard`)

**Interfaces:**
- Consumes: `loadCatalogSnapshot()` → `CatalogSnapshot` (`apps/web/lib/catalog/types.ts`); `MealSizeView` has `{ id, key, name, tier, diet, components, kcalMin, kcalMax, proteinG, carbsG, fatG, basePrice }`.
- Produces: `<MealCard meal={MealSizeView} />`.

- [ ] **Step 1: MealCard** — append to `apps/web/components/marketing/cards.tsx`

```tsx
import { Badge } from "@/components/ui/badge";
import type { MealSizeView } from "@/lib/catalog/types";

export function MealCard({ meal }: { meal: MealSizeView }) {
  return (
    <div className="flex flex-col rounded-lg border p-5">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{meal.name}</h3>
        <Badge variant="secondary" className="capitalize">{meal.diet}</Badge>
      </div>
      <p className="text-muted-foreground mt-1 text-sm">{meal.components.join(", ")}</p>
      <div className="text-muted-foreground mt-3 grid grid-cols-2 gap-1 text-xs">
        <span>{meal.kcalMin}–{meal.kcalMax} kcal</span>
        {meal.proteinG != null ? <span>{meal.proteinG} g protein</span> : null}
        {meal.carbsG != null ? <span>{meal.carbsG} g carbs</span> : null}
        {meal.fatG != null ? <span>{meal.fatG} g fat</span> : null}
      </div>
      <div className="mt-4 text-lg font-semibold">${meal.basePrice.toFixed(2)}<span className="text-muted-foreground text-sm font-normal"> / meal</span></div>
    </div>
  );
}
```

(Keep the existing `StepCard` export; add these imports at the top of the file alongside it.)

- [ ] **Step 2: Menu page** — `apps/web/app/(marketing)/menu/page.tsx`

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { Section } from "@/components/marketing/section";
import { MealCard } from "@/components/marketing/cards";

export const metadata: Metadata = { title: "Menu — Tiffin Grab", description: "Browse meal sizes by tier, with calories and macros, available across the GTA." };

const TIERS = [
  { key: "budget", label: "Budget" },
  { key: "medium", label: "Medium" },
  { key: "premium", label: "Premium" },
] as const;

export default async function MenuPage() {
  const { mealSizes } = await loadCatalogSnapshot();
  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Our menu</h1>
        <p className="text-muted-foreground mt-2">Meal sizes across three tiers — pick what fits your appetite and macros.</p>
      </div>
      {TIERS.map((tier) => {
        const meals = mealSizes.filter((m) => m.tier === tier.key);
        if (meals.length === 0) return null;
        return (
          <div key={tier.key} className="space-y-4">
            <h2 className="text-xl font-medium">{tier.label}</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {meals.map((m) => <MealCard key={m.id} meal={m} />)}
            </div>
          </div>
        );
      })}
      <Button asChild size="lg"><Link href="/subscribe">Build your plan</Link></Button>
    </Section>
  );
}
```

- [ ] **Step 3: Verify** — ensure catalog is seeded, then build.

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog`
Run (root): `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build`
Expected: `/menu` builds (dynamic — it reads the DB) and renders meal cards grouped by tier.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(marketing\)/menu apps/web/components/marketing/cards.tsx
git commit -m "feat(marketing): live Menu page from catalog"
```

---

## Task 4: Live Pricing page

**Files:**
- Create: `apps/web/app/(marketing)/pricing/page.tsx`

**Interfaces:**
- Consumes: `loadCatalogSnapshot()` → `{ plans, addons, frequencies, durations }`. Shapes (from `types.ts`): `plans: { id, key, name, description }[]`; `addons: { key, name, pricePerWeek }[]`; `frequencies: { id, key, name, daysPerWeek, courierDiscountPct }[]`; `durations: { id, weeks, discountPct }[]`.

- [ ] **Step 1: Pricing page** — `apps/web/app/(marketing)/pricing/page.tsx`

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { Section } from "@/components/marketing/section";

export const metadata: Metadata = { title: "Pricing — Tiffin Grab", description: "Plans, add-ons, delivery frequencies, and loyalty discounts. Pricing is built from your selections." };

export default async function PricingPage() {
  const { plans, addons, frequencies, durations } = await loadCatalogSnapshot();
  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Pricing</h1>
        <p className="text-muted-foreground mt-2">
          Your weekly fee is built from your meal size × quantity × billable days, plus add-ons,
          minus courier, student, and loyalty discounts.
        </p>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-medium">Nutrition baselines</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {plans.map((p) => (
            <div key={p.id} className="rounded-lg border p-5">
              <h3 className="font-medium">{p.name}</h3>
              {p.description ? <p className="text-muted-foreground mt-1 text-sm">{p.description}</p> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-8 sm:grid-cols-3">
        <div>
          <h2 className="text-xl font-medium">Add-ons</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {addons.map((a) => <li key={a.key} className="flex justify-between"><span>{a.name}</span><span>+${a.pricePerWeek.toFixed(2)}/wk</span></li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-medium">Frequencies</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {frequencies.map((f) => <li key={f.id} className="flex justify-between"><span>{f.name}</span>{f.courierDiscountPct ? <span>-{f.courierDiscountPct}%</span> : null}</li>)}
          </ul>
        </div>
        <div>
          <h2 className="text-xl font-medium">Commitment</h2>
          <ul className="text-muted-foreground mt-3 space-y-1 text-sm">
            {durations.map((d) => <li key={d.id} className="flex justify-between"><span>{d.weeks} week{d.weeks > 1 ? "s" : ""}</span>{d.discountPct ? <span>-{d.discountPct}%</span> : null}</li>)}
          </ul>
        </div>
      </div>

      <Button asChild size="lg"><Link href="/subscribe">Start your plan</Link></Button>
    </Section>
  );
}
```

- [ ] **Step 2: Verify** — Run (root): `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build`. Expected: `/pricing` builds and renders plans, add-ons, frequencies, durations.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/\(marketing\)/pricing
git commit -m "feat(marketing): live Pricing page from catalog"
```

---

## Task 5: Contact form → website inquiry (waitlist-aware)

**Files:**
- Create: `apps/web/app/(marketing)/contact/actions.ts`
- Create: `apps/web/app/(marketing)/contact/contact-form.tsx`
- Create: `apps/web/app/(marketing)/contact/page.tsx`
- Test: `apps/web/app/(marketing)/contact/__tests__/actions.test.ts`

**Interfaces:**
- Consumes: `inquiriesService.create`, `matchZone`, `loadCatalogSnapshot`, `isValidCaPhone`, `ValidationError`.
- Produces: `createWebsiteInquiry(input: ContactInput): Promise<{ ok: true; waitlisted: boolean }>` where `ContactInput = { fullName: string; phone: string; email?: string; postalCode?: string; message?: string; company?: string }` (`company` is the honeypot).

- [ ] **Step 1: Write the failing test** — `apps/web/app/(marketing)/contact/__tests__/actions.test.ts`

```ts
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { ValidationError } from "@tiffin/commons";
import { db } from "@/db/client";
import { inquiries, inquiryActivities } from "@/db/schema";

// Contact action transitively imports the session service (NextAuth) — stub it.
vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { createWebsiteInquiry } = await import("../actions");

async function reset() {
  await db.delete(inquiryActivities);
  await db.delete(inquiries);
}

describe("createWebsiteInquiry", () => {
  beforeEach(reset);
  afterAll(reset);

  it("creates a website inquiry with a created activity", async () => {
    const res = await createWebsiteInquiry({ fullName: "Web Lead", phone: "+16475559000", message: "Interested" });
    expect(res.ok).toBe(true);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559000"));
    expect(row.source).toBe("website");
    expect(row.notes).toBe("Interested");
    const acts = await db.select().from(inquiryActivities).where(eq(inquiryActivities.inquiryId, row.id));
    expect(acts.some((a) => a.type === "created")).toBe(true);
  });

  it("flags an unserved postal code as waitlisted in prefs", async () => {
    const res = await createWebsiteInquiry({ fullName: "Far Lead", phone: "+16475559001", postalCode: "X0X 0X0" });
    expect(res.waitlisted).toBe(true);
    const [row] = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559001"));
    expect((row.prefs as { waitlisted: boolean }).waitlisted).toBe(true);
  });

  it("rejects a malformed phone", async () => {
    await expect(createWebsiteInquiry({ fullName: "Bad", phone: "12" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("silently drops a honeypot-filled submission without writing", async () => {
    const res = await createWebsiteInquiry({ fullName: "Bot", phone: "+16475559002", company: "spam-co" });
    expect(res.ok).toBe(true);
    const rows = await db.select().from(inquiries).where(eq(inquiries.phone, "+16475559002"));
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it — verify it fails**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run app/\(marketing\)/contact/__tests__/actions.test.ts`
Expected: FAIL — `createWebsiteInquiry` not found.

- [ ] **Step 3: Implement the action** — `apps/web/app/(marketing)/contact/actions.ts`

```ts
"use server";

import { ValidationError } from "@tiffin/commons";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { isValidCaPhone } from "@/lib/services/users-contact";
import { inquiriesService } from "@/lib/services/inquiries.service";

export interface ContactInput {
  fullName: string;
  phone: string;
  email?: string;
  postalCode?: string;
  message?: string;
  company?: string; // honeypot — real users never see/fill this
}

export async function createWebsiteInquiry(input: ContactInput): Promise<{ ok: true; waitlisted: boolean }> {
  // Honeypot: a filled hidden field means a bot — accept silently, write nothing.
  if (input.company && input.company.trim() !== "") return { ok: true, waitlisted: false };

  const fullName = input.fullName.trim();
  const phone = input.phone.trim();
  if (!fullName) throw new ValidationError("Name is required");
  if (!isValidCaPhone(phone)) throw new ValidationError("Invalid phone number");

  let servedZone: string | null = null;
  if (input.postalCode?.trim()) {
    const { zones } = await loadCatalogSnapshot();
    servedZone = matchZone(input.postalCode, zones)?.name ?? null;
  }
  const waitlisted = input.postalCode?.trim() ? servedZone === null : false;

  await inquiriesService.create({
    fullName,
    phone,
    email: input.email?.trim() || null,
    source: "website",
    notes: input.message?.trim() || null,
    prefs: { servedZone, waitlisted },
  });

  return { ok: true, waitlisted };
}
```

- [ ] **Step 4: Run it — verify it passes**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm vitest run app/\(marketing\)/contact/__tests__/actions.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Contact form (client)** — `apps/web/app/(marketing)/contact/contact-form.tsx`

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createWebsiteInquiry } from "./actions";

export function ContactForm() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { waitlisted: boolean }>(null);
  const [form, setForm] = useState({ fullName: "", phone: "", email: "", postalCode: "", message: "", company: "" });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    setError(null);
    start(async () => {
      try {
        const res = await createWebsiteInquiry(form);
        setDone({ waitlisted: res.waitlisted });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
      }
    });
  };

  if (done) {
    return (
      <div className="rounded-lg border p-6">
        <h2 className="font-medium">Thanks — we got your message.</h2>
        <p className="text-muted-foreground mt-2 text-sm">
          {done.waitlisted
            ? "We don't serve your area just yet — you're on the waitlist and we'll reach out when we expand."
            : "Our team will be in touch shortly."}
        </p>
      </div>
    );
  }

  return (
    <div className="grid max-w-lg gap-3">
      <div><Label htmlFor="fullName">Name</Label><Input id="fullName" value={form.fullName} onChange={(e) => set({ fullName: e.target.value })} /></div>
      <div><Label htmlFor="phone">Phone</Label><Input id="phone" type="tel" value={form.phone} onChange={(e) => set({ phone: e.target.value })} /></div>
      <div><Label htmlFor="email">Email <span className="text-muted-foreground">(optional)</span></Label><Input id="email" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} /></div>
      <div><Label htmlFor="postal">Postal code <span className="text-muted-foreground">(optional)</span></Label><Input id="postal" value={form.postalCode} onChange={(e) => set({ postalCode: e.target.value })} /></div>
      <div>
        <Label htmlFor="message">Message</Label>
        <textarea
          id="message"
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:outline-none"
          value={form.message}
          onChange={(e) => set({ message: e.target.value })}
        />
      </div>
      {/* Honeypot: visually hidden, off the tab order; real users never fill it. */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
        value={form.company}
        onChange={(e) => set({ company: e.target.value })}
      />
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      <Button onClick={submit} disabled={pending || !form.fullName || !form.phone} className="w-fit">Send message</Button>
    </div>
  );
}
```

- [ ] **Step 6: Contact page** — `apps/web/app/(marketing)/contact/page.tsx`

```tsx
import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact — Tiffin Grab", description: "Get in touch — tell us about your tiffin needs and where you're located." };

export default function ContactPage() {
  return (
    <Section className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Contact us</h1>
        <p className="text-muted-foreground mt-2">Tell us what you're after. Add your postal code and we'll confirm whether we deliver to your area.</p>
      </div>
      <ContactForm />
    </Section>
  );
}
```

- [ ] **Step 7: Verify**

Run (root): `pnpm test && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build`
Expected: contact tests PASS; `/contact` builds.

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/\(marketing\)/contact
git commit -m "feat(marketing): contact form creates a waitlist-aware website inquiry"
```

---

## Task 6: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite + build**

Run (root): `DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm test && pnpm typecheck && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm build`
Expected: all green; the build route list includes `/`, `/how-it-works`, `/menu`, `/pricing`, `/about`, `/faq`, `/contact`, and the unchanged funnel/dashboard routes.

- [ ] **Step 2: Reseed (tests wiped shared data)**

Run: `cd apps/web && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:catalog && DATABASE_URL="postgres://lawbringr@localhost:5432/tiffin" pnpm db:seed:admin`

- [ ] **Step 3: Manual smoke (document results; needs the dev server)**:
  1. `/` renders within the marketing header/footer; "Start subscription" → `/subscribe`; "Sign in" → `/login`.
  2. `/menu` and `/pricing` show real seeded catalog data; retire a meal size in `/dashboard/catalog/meal-sizes` (admin) and confirm it disappears from `/menu`.
  3. `/contact` with a served postal (e.g. `M5V 2T6`) → "team will be in touch"; an unserved postal (e.g. `X0X 0X0`) → waitlist message; both create an inquiry visible in `/dashboard/inquiries` with source `website`.

- [ ] **Step 4: Commit (if any verification fixes were needed; otherwise skip)**

---

## Self-review notes

- **Spec coverage:** §2 routing → Tasks 1–5; shared header/footer/layout → Task 1; how-it-works/about/faq → Task 2; live `/menu` → Task 3; live `/pricing` → Task 4; contact action + waitlist + honeypot → Task 5; SEO `metadata` → every page task; testing → Task 5 + Task 6; theme reuse → all tasks use `components/ui/*`. Starter `app/page.tsx` removed → Task 1 Step 5/7.
- **Type consistency:** `createWebsiteInquiry(input: ContactInput)` and `ContactInput` (incl. `company` honeypot) are identical across the test (Task 5 Step 1), the action (Step 3), and the form (Step 5). `MealSizeView`/snapshot field names match `lib/catalog/types.ts`. `inquiriesService.create` accepts the `{ source, notes, prefs }` object (no field allowlist on inquiries — verified).
- **Placeholder scan:** none — every code step is complete.
- **DB note:** Menu/Pricing/Contact read the DB, so their builds and tests need `DATABASE_URL` and a seeded catalog; commands include it.
