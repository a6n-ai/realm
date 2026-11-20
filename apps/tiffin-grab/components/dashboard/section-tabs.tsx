"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@foundry/ui/cn";
import { SECTIONS, isNavActive } from "@/components/dashboard/app-sidebar";
import { useNavAllowed } from "@/components/dashboard/nav-access-provider";

// Sibling pages of one sidebar section. Only rendered on that section's pages, so
// the sidebar's `>` item stays the single entry point and tabs never cross sections.
export function SectionTabs() {
  const pathname = usePathname();
  const navAllowed = useNavAllowed();
  const section = SECTIONS.flatMap((s) => s.items).find((item) =>
    item.children?.some((child) => isNavActive(pathname, child.href)),
  );
  const tabs = (section?.children ?? []).filter((child) => navAllowed(child.href));
  if (!section || tabs.length < 2) return null;

  return (
    <nav aria-label={section.title} className="mb-6 flex gap-5 overflow-x-auto border-b">
      {tabs.map((tab) => {
        const active = isNavActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-0.5 pb-2 text-footnote font-medium whitespace-nowrap transition-colors",
              active ? "border-foreground text-foreground" : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.title}
          </Link>
        );
      })}
    </nav>
  );
}
