"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarOffIcon,
  ChevronRightIcon,
  ClockIcon,
  GlobeIcon,
  MegaphoneIcon,
  PuzzleIcon,
  ScrollTextIcon,
  SearchXIcon,
  SettingsIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import { Card, EmptyState, SearchInput } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { PLUGIN_DISPLAY, PLUGIN_METAS, type Tone } from "@/lib/plugins";
import { IconTile } from "./_components/icon-tile";

type Item = { label: string; description: string; icon: LucideIcon; tone: Tone; href: string };
type Group = { title: string; items: Item[] };

const STATIC_GROUPS: Group[] = [
  {
    title: "Business",
    items: [
      { label: "General", description: "Timezone and order cutoff", icon: SettingsIcon, tone: "gray", href: "/dashboard/settings/general" },
      { label: "Meal types", description: "Plan types, dish categories, menu setup", icon: UtensilsCrossedIcon, tone: "orange", href: "/dashboard/settings/meal-types" },
      { label: "Holidays", description: "Kitchen closures and where those deliveries go", icon: CalendarOffIcon, tone: "red", href: "/dashboard/settings/holidays" },
      { label: "Owner assignment", description: "Who owns new inquiries, orders and tickets", icon: UsersIcon, tone: "blue", href: "/dashboard/settings/owner-assignment" },
    ],
  },
  {
    title: "Growth",
    items: [
      { label: "Promotions", description: "Home page sticker, popup and offers", icon: MegaphoneIcon, tone: "pink", href: "/dashboard/settings/promotions" },
      { label: "Lead sources", description: "Where inquiries come from", icon: Webhook, tone: "teal", href: "/dashboard/settings/lead-sources" },
      { label: "Public website", description: "FAQ and other public content", icon: GlobeIcon, tone: "sky", href: "/dashboard/settings/public-website" },
    ],
  },
  {
    title: "System",
    items: [
      { label: "Scheduled jobs", description: "Automatic jobs, last result and next run", icon: ClockIcon, tone: "gray", href: "/dashboard/settings/scheduled-jobs" },
      { label: "Logs", description: "Customer and staff activity", icon: ScrollTextIcon, tone: "gray", href: "/dashboard/settings/logs" },
    ],
  },
];

export function SettingsDirectory({ installedPluginIds }: { installedPluginIds: string[] }) {
  const [query, setQuery] = useState("");

  const groups = useMemo<Group[]>(() => {
    const plugins: Item[] = PLUGIN_METAS.filter((m) => m.settingsHref && installedPluginIds.includes(m.id)).map((m) => ({
      label: m.label,
      description: m.description,
      icon: m.icon,
      tone: PLUGIN_DISPLAY[m.id]?.tone ?? "gray",
      href: m.settingsHref!,
    }));
    const integrations: Group = {
      title: "Integrations",
      items: [
        { label: "Plugin marketplace", description: "Browse, install and remove plugins", icon: PuzzleIcon, tone: "indigo", href: "/dashboard/settings/integrations" },
        ...plugins,
      ],
    };
    // Integrations sits beside Business on wide screens: the two most visited groups lead.
    return [STATIC_GROUPS[0], integrations, STATIC_GROUPS[1], STATIC_GROUPS[2]];
  }, [installedPluginIds]);

  const q = query.trim().toLowerCase();
  const visible = q
    ? groups
        .map((g) => ({ ...g, items: g.items.filter((i) => `${i.label} ${i.description}`.toLowerCase().includes(q)) }))
        .filter((g) => g.items.length)
    : groups;

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-sm">
        <SearchInput value={query} onChange={setQuery} placeholder="Search settings" />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          message={`No setting matches "${query.trim()}".`}
          action={
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              Clear search
            </Button>
          }
        />
      ) : (
        // Columns, not a grid: groups differ in length, and a grid row leaves a hole under the short one.
        <div className="gap-6 lg:columns-2">
          {visible.map((g) => (
            <section key={g.title} className="mb-6 flex break-inside-avoid flex-col gap-2 last:mb-0" aria-labelledby={`settings-${g.title}`}>
              <h2 id={`settings-${g.title}`} className="text-muted-foreground px-1 text-xs font-medium">
                {g.title}
              </h2>
              <Card variant="flat" className="overflow-hidden p-0">
                <ul className="divide-border divide-y">
                  {g.items.map((i) => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        prefetch={false}
                        className="hover:bg-accent focus-visible:bg-accent flex items-center gap-3 px-4 py-3 transition-colors outline-none"
                      >
                        <IconTile icon={i.icon} tone={i.tone} />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="text-sm font-medium">{i.label}</span>
                          <span className="text-muted-foreground truncate text-xs">{i.description}</span>
                        </span>
                        <ChevronRightIcon aria-hidden className="text-muted-foreground size-4 shrink-0" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
