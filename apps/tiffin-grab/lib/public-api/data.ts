import { runsOf } from "@/lib/landing/areas";
import type { LandingPromo, LandingPromos } from "@/lib/landing/promo-types";
import { deliveryLine } from "@/lib/landing/llms-text";
import type { CatalogSnapshot } from "@/lib/catalog/types";
import { windowOf } from "@/lib/public-api/postal";
import type { BoardDay } from "@/components/landing/week-board";
import type { BoardWeekend } from "@/lib/landing/week-board";
import type { FaqGroup } from "@/lib/landing/faq-list";
import { SUPPORT_E164 } from "@/lib/landing/contact";
import { CONTACT_EMAIL, CONTACT_PHONE, type SiteFacts } from "@/lib/landing/site-facts";
import type { ReferralOffer } from "@/lib/referrals/offer";
import { referHeadline } from "@/components/landing/refer/refer-content";

export const plansBody = (f: SiteFacts, origin: string) => ({
  currency: f.currency,
  plans: f.plans.map((p) => ({
    key: p.key,
    name: p.name,
    description: p.description,
    sizes: p.sizes.map((s) => ({ name: s.name, pricePerTiffin: s.rate, contains: s.parts, kcal: { min: s.kcalMin, max: s.kcalMax }, proteinG: s.proteinG, trial: s.trial })),
  })),
  longerPlanDiscounts: f.weeksOff.map((d) => ({ weeks: d.weeks, label: d.label, percent: d.percent })),
  trial: f.trial ? { length: f.trial.length, pricePerTiffin: f.trial.rate } : null,
  source: `${origin}/pricing`,
});

export function deliveryBody(f: SiteFacts, catalog: CatalogSnapshot, origin: string) {
  const zones = catalog.zones.filter((z) => z.active);
  return {
    areas: zones
      .map((z) => ({ name: z.name, postalPrefixes: z.postalPrefixes, window: windowOf(z.slotWindow) ?? z.slotWindow }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    windows: runsOf(zones).map((r) => ({ label: r.label, areas: r.zones.map((z) => z.name).sort((a, b) => a.localeCompare(b)) })),
    cutoff: f.cutoff,
    freeDelivery: f.free,
    deliveryCharge: deliveryLine(f),
    weekendRule: "Saturday and Sunday tiffins come with the Friday delivery",
    days: "Monday to Friday",
    source: `${origin}/locations`,
  };
}

export function promotionsBody(p: LandingPromos, origin: string) {
  const seen = new Set<string>();
  const shown = [p.sticker, p.popup, ...p.sections].filter((x): x is LandingPromo => !!x && !seen.has(x.id) && !!seen.add(x.id));
  return {
    promotions: shown.map((x) => ({ title: x.title, description: x.blurb, code: x.code, url: new URL(x.href, origin).href, badge: x.badge ?? null })),
  };
}

type Board = { days: BoardDay[]; rows: string[]; weekend: BoardWeekend | null };

export const menuBody = (weekStart: string | null, b: Board, origin: string) => ({
  weekStart,
  days: b.days.map((d) => ({ day: d.label, date: d.date, dishes: Object.fromEntries(b.rows.filter((r) => d.dishes[r]?.length).map((r) => [r, d.dishes[r]!])) })),
  weekend: b.weekend ? { date: b.weekend.date, dishes: b.weekend.dishes, note: "Comes with the Friday delivery" } : null,
  pdf: `${origin}/menu/weekly/pdf`,
  source: `${origin}/menu`,
});

export const referralBody = (o: ReferralOffer, origin: string) => ({
  active: o.on,
  headline: o.on ? referHeadline(o) : null,
  friendGets: o.friend ? { amount: o.friend.big, detail: o.friend.small || null } : null,
  referrerGets: o.referrer ? { amount: o.referrer.big, detail: o.referrer.small || null } : null,
  maxPerReferrer: o.maxPerReferrer,
  source: `${origin}/refer`,
});

export const faqBody = (groups: FaqGroup[], origin: string) => ({
  groups: groups.map((g) => ({ heading: g.heading || null, items: g.items.map(({ q, a }) => ({ question: q, answer: a })) })),
  source: `${origin}/faq`,
});

export const contactBody = (origin: string) => ({
  email: CONTACT_EMAIL,
  phone: CONTACT_PHONE,
  whatsapp: `https://wa.me/${SUPPORT_E164}`,
  source: `${origin}/contact`,
});
