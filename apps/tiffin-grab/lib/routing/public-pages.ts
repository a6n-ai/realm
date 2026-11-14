// The one list of public pages. No imports: proxy.ts (via markdown-negotiation) and the client header read it.
// public-pages.json (read by the Worker page cache, scripts/cloudflare-cache.mjs and next.config) must hold the
// same paths; routing/__tests__/public-pages.test.ts fails when they drift.

export type PublicPage = {
  path: string;
  label: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
  /** Has a markdown version for `Accept: text/markdown`. */
  markdown?: true;
  /** Listed in the sitemap only while this holds (checked by the sitemap). */
  only?: "reviews";
  /** llms.txt entry: link text (defaults to label) and a description, absent for policy links. */
  llms?: { title?: string; desc?: string };
};

// Sitemap order.
export const PUBLIC_PAGES: readonly PublicPage[] = [
  { path: "/", label: "Home", changeFrequency: "weekly", priority: 1, markdown: true },
  { path: "/pricing", label: "Pricing", changeFrequency: "monthly", priority: 0.8, markdown: true, llms: { desc: "plans, every meal size, what is in it and the rate per tiffin" } },
  { path: "/menu", label: "Menu", changeFrequency: "weekly", priority: 0.9, llms: { desc: "this week's dishes day by day and every meal size" } },
  { path: "/locations", label: "Locations", changeFrequency: "monthly", priority: 0.7, markdown: true, llms: { title: "Delivery areas", desc: "areas served, delivery windows and a postal code check" } },
  { path: "/faq", label: "FAQ", changeFrequency: "monthly", priority: 0.6, markdown: true, llms: { desc: "delivery, pausing, plans, food, payments and refunds" } },
  { path: "/refer", label: "Refer", changeFrequency: "monthly", priority: 0.5, llms: { title: "Refer a friend", desc: "the referral offer" } },
  { path: "/about", label: "About", changeFrequency: "monthly", priority: 0.6, llms: { desc: "how a tiffin is cooked, packed and delivered, with live kitchen counts" } },
  { path: "/contact", label: "Contact", changeFrequency: "yearly", priority: 0.5, llms: { desc: "ask about a plan, an area or an order" } },
  { path: "/legal", label: "Legal", changeFrequency: "yearly", priority: 0.3 },
  { path: "/terms", label: "Terms", changeFrequency: "yearly", priority: 0.3, llms: {} },
  { path: "/privacy", label: "Privacy", changeFrequency: "yearly", priority: 0.3, llms: { title: "Privacy policy" } },
  { path: "/refund-policy", label: "Refunds", changeFrequency: "yearly", priority: 0.3, llms: { title: "Refund policy" } },
  { path: "/delivery-policy", label: "Delivery", changeFrequency: "yearly", priority: 0.3, llms: { title: "Delivery policy" } },
  { path: "/reviews", label: "Reviews", changeFrequency: "weekly", priority: 0.6, only: "reviews", llms: { desc: "Google reviews from customers" } },
];

export const pageOf = (path: string): PublicPage => {
  const p = PUBLIC_PAGES.find((x) => x.path === path);
  if (!p) throw new Error(`not a public page: ${path}`);
  return p;
};
