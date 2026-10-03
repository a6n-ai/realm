import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Info } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { LegalToc } from "./legal-toc";

export const LEGAL_EMAIL = "info@tiffingrab.ca";

export const LEGAL_DOCS = [
  { href: "/terms", title: "Terms of Service", summary: "Eligibility, billing, subscriptions, allergens, acceptable use, liability, and governing law." },
  { href: "/privacy", title: "Privacy Policy", summary: "What we collect, how we use it, PIPEDA rights, security, retention, and cookies." },
  { href: "/refund-policy", title: "Refund Policy", summary: "Trial, weekly, and monthly plans; quality claims; processing times; non-refundable cases." },
  { href: "/delivery-policy", title: "Delivery Policy", summary: "Service areas, windows, failed deliveries, packaging, food handling, and weather delays." },
] as const;

/** One plain-language key point in "The short version", pointing at the section that governs it. */
export type KeyPoint = { text: ReactNode; section: number };

/**
 * Shell for one legal document. Readers come for one answer ("can I get a
 * refund?"), so the page leads with a plain-language summary that links into
 * the full text, and a contents list keeps every section one tap away. The
 * legal text itself stays verbatim below.
 */
export function LegalPage({
  title,
  intro,
  updated,
  current,
  sections,
  keyPoints,
  children,
}: {
  title: string;
  intro: string;
  updated: string;
  current: string;
  sections: readonly string[];
  keyPoints: KeyPoint[];
  children: ReactNode;
}) {
  const toc = sections.map((t, i) => ({ id: `s${i + 1}`, label: `${i + 1}. ${t}` }));
  return (
    <Section className="max-w-6xl">
      <nav aria-label="Breadcrumb" className="text-muted-foreground mb-6 text-sm">
        <Link href="/legal" className="hover:text-foreground underline-offset-4 hover:underline">Policies</Link>
        <span aria-hidden className="px-2">/</span>
        <span className="text-foreground">{title}</span>
      </nav>

      <header className="mb-10 max-w-[68ch]">
        <h1 className="m-0 mb-3 text-balance text-[clamp(32px,5vw,48px)] font-bold leading-[1.05] tracking-[-0.03em]">{title}</h1>
        <p className="text-muted-foreground m-0 text-[17px] leading-relaxed">{intro}</p>
        <p className="text-muted-foreground mt-3 mb-0 text-sm">Updated {updated} · TiffinGrab, Ontario, Canada</p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-16">
        <LegalToc items={toc} />

        <div className="min-w-0 max-w-[68ch]">
          <aside aria-labelledby="short-version" className="bg-muted mb-12 rounded-2xl p-5 sm:p-7">
            <h2 id="short-version" className="m-0 mb-1 text-lg font-semibold tracking-[-0.01em]">The short version</h2>
            <p className="text-muted-foreground m-0 mb-5 text-sm">
              The key points in plain words. The full text below is what applies.
            </p>
            <ul className="m-0 list-none space-y-3 p-0">
              {keyPoints.map((k, i) => (
                <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
                  <span aria-hidden className="bg-primary mt-[9px] size-1.5 shrink-0 rounded-full" />
                  <span>
                    {k.text}{" "}
                    <a href={`#s${k.section}`} className="text-muted-foreground hover:text-foreground whitespace-nowrap text-sm underline-offset-4 hover:underline">
                      Details
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          </aside>

          <div className="space-y-12 text-[17px] leading-[1.65] [&_strong]:font-semibold">{children}</div>

          <footer className="mt-16 border-t pt-8">
            <p className="m-0 mb-6 text-[15px]">
              Questions about this policy? Email <Mail />. We&apos;re happy to explain anything here.
            </p>
            <p className="text-muted-foreground m-0 mb-3 text-sm font-medium">Other policies</p>
            <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-3">
              {LEGAL_DOCS.filter((d) => d.href !== current).map((d) => (
                <li key={d.href}>
                  <Link href={d.href} className="group hover:bg-muted flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-[15px]">
                    {d.title}
                    <ArrowRight aria-hidden className="text-muted-foreground size-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </footer>
        </div>
      </div>
    </Section>
  );
}

/** A numbered section: "3. Services". Anchored so key points and the contents list can link to it. */
export function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section id={`s${n}`} aria-labelledby={`s${n}-h`} className="scroll-mt-28 space-y-4">
      <h2 id={`s${n}-h`} className="m-0 text-[22px] font-semibold leading-snug tracking-[-0.015em]">
        <span className="text-muted-foreground mr-2 tabular-nums">{n}.</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <h3 className="m-0 text-[17px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** A highlighted notice: "Binding agreement", "Allergen warning". */
export function Callout({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  const Icon = tone === "warn" ? AlertTriangle : Info;
  return (
    <div
      role="note"
      className={`flex gap-3 rounded-2xl px-4 py-4 text-[15px] leading-relaxed sm:px-5 ${
        tone === "warn" ? "bg-destructive/10" : "bg-muted"
      }`}
    >
      <Icon aria-hidden className={`mt-0.5 size-5 shrink-0 ${tone === "warn" ? "text-destructive" : "text-muted-foreground"}`} />
      <div>{children}</div>
    </div>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 list-disc space-y-1.5 pl-5 marker:text-muted-foreground">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

/** In-text cross-reference: "see section 7". */
export function SeeSection({ n }: { n: number }) {
  return <a href={`#s${n}`} className="underline underline-offset-4">section {n}</a>;
}

export function Mail() {
  return <a href={`mailto:${LEGAL_EMAIL}`} className="font-medium underline underline-offset-4">{LEGAL_EMAIL}</a>;
}
