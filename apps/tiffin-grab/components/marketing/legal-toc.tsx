"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

type Item = { id: string; label: string };

/**
 * "On this page": a sticky list beside the text on desktop that marks the
 * section you are reading; a collapsible list above the text on phones.
 */
export function LegalToc({ items }: { items: Item[] }) {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const targets = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => !!el);
    // The section whose heading most recently crossed the top third is "current".
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-15% 0px -70% 0px" },
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, [items]);

  const links = (
    <ol className="m-0 list-none space-y-0.5 p-0">
      {items.map((i) => (
        <li key={i.id}>
          <a
            href={`#${i.id}`}
            aria-current={active === i.id ? "location" : undefined}
            className={`block rounded-lg px-3 py-1.5 text-sm leading-snug transition-colors ${
              active === i.id ? "bg-muted text-foreground font-medium" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {i.label}
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <details className="group bg-muted/60 rounded-2xl lg:hidden">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-[15px] font-medium">
          On this page
          <ChevronDown aria-hidden className="size-4 transition-transform group-open:rotate-180" />
        </summary>
        <nav aria-label="On this page" className="px-1 pb-3">{links}</nav>
      </details>
      <nav aria-label="On this page" className="hidden lg:block">
        <div className="sticky top-28">
          <p className="text-muted-foreground m-0 mb-3 px-3 text-xs font-semibold tracking-wide uppercase">On this page</p>
          {links}
        </div>
      </nav>
    </>
  );
}
