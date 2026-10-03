import type { ReactNode } from "react";
import Link from "next/link";
import { Section } from "@/components/marketing/section";

export const LEGAL_EMAIL = "info@tiffingrab.ca";

export const LEGAL_DOCS = [
  { href: "/terms", title: "Terms of Service", summary: "Eligibility, billing, subscriptions, allergens, acceptable use, liability, and governing law." },
  { href: "/privacy", title: "Privacy Policy", summary: "What we collect, how we use it, PIPEDA rights, security, retention, and cookies." },
  { href: "/refund-policy", title: "Refund Policy", summary: "Trial, weekly, and monthly plans; quality claims; processing times; non-refundable cases." },
  { href: "/delivery-policy", title: "Delivery Policy", summary: "Service areas, windows, failed deliveries, packaging, food handling, and weather delays." },
] as const;

/** Shell for one legal document: title, dates, body, and links to the others. */
export function LegalPage({ title, meta, current, children }: { title: string; meta: string; current: string; children: ReactNode }) {
  return (
    <Section className="max-w-3xl">
      <nav aria-label="Legal" className="mb-8 text-sm">
        <Link href="/legal" className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">
          Policies
        </Link>
        <span className="text-muted-foreground px-2">/</span>
        <span>{title}</span>
      </nav>
      <header className="mb-10 border-b pb-8">
        <h1 className="m-0 mb-3 text-[clamp(28px,5vw,44px)] font-bold tracking-[-1px]">{title}</h1>
        <p className="text-muted-foreground m-0 text-sm">TiffinGrab · Ontario, Canada</p>
        <p className="text-muted-foreground m-0 text-sm">{meta}</p>
      </header>
      <div className="space-y-10 text-[15px] leading-relaxed [&_strong]:font-semibold">{children}</div>
      <footer className="mt-14 border-t pt-8">
        <p className="m-0 mb-4 text-sm">
          Questions? <a href={`mailto:${LEGAL_EMAIL}`} className="font-medium underline underline-offset-4">{LEGAL_EMAIL}</a>
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0 text-sm">
          {LEGAL_DOCS.filter((d) => d.href !== current).map((d) => (
            <li key={d.href}>
              <Link href={d.href} className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline">{d.title}</Link>
            </li>
          ))}
        </ul>
      </footer>
    </Section>
  );
}

/** A numbered section: "§ 3 Services". */
export function Clause({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section id={`s${n}`} className="scroll-mt-24 space-y-3">
      <h2 className="m-0 text-xl font-semibold tracking-[-0.3px]">
        <span className="text-muted-foreground mr-2 tabular-nums">§ {n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Sub({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <h3 className="m-0 text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

/** A highlighted notice: the "Binding agreement" / "Allergen warning" boxes. */
export function Callout({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return (
    <div
      role={tone === "warn" ? "note" : undefined}
      className={`rounded-xl px-4 py-3 ${tone === "warn" ? "bg-destructive/10 text-foreground" : "bg-muted"}`}
    >
      {children}
    </div>
  );
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="m-0 list-disc space-y-1 pl-5 marker:text-muted-foreground">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ul>
  );
}

export function Mail() {
  return <a href={`mailto:${LEGAL_EMAIL}`} className="underline underline-offset-4">{LEGAL_EMAIL}</a>;
}
