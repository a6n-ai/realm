"use client";

import { useMemo, useState } from "react";
import {
  CalendarOffIcon,
  ClockIcon,
  GlobeIcon,
  MailCheckIcon,
  MegaphoneIcon,
  PuzzleIcon,
  ScrollTextIcon,
  SearchXIcon,
  SettingsIcon,
  UsersIcon,
  UtensilsCrossedIcon,
  Webhook,
} from "lucide-react";
import type { PluginIcon, PluginLogo } from "@foundry/commons/plugin";
import { EmptyState, SearchInput } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { PLUGIN_METAS, type Tone } from "@/lib/plugins";
import { Skeleton } from "@foundry/ui/skeleton";
import { IconTile } from "./_components/icon-tile";
import { SettingsColumns, SettingsGroup, SettingsGroupSkeleton, SettingsRow } from "./_components/grouped-list";

type Item = { label: string; description: string; icon: PluginIcon; tone: Tone; logo?: PluginLogo; href: string };
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
      { label: "Email tracking", description: "Opens, clicks and delivery records for emails", icon: MailCheckIcon, tone: "blue", href: "/dashboard/settings/email-tracking" },
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
      tone: m.tone ?? "gray",
      logo: m.logo,
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
        <SettingsColumns>
          {visible.map((g) => (
            <SettingsGroup key={g.title} title={g.title}>
              {g.items.map((i) => (
                <SettingsRow
                  key={i.href}
                  href={i.href}
                  tile={<IconTile icon={i.icon} tone={i.tone} logo={i.logo} />}
                  label={i.label}
                  description={i.description}
                />
              ))}
            </SettingsGroup>
          ))}
        </SettingsColumns>
      )}
    </div>
  );
}

/** Mirrors the directory: search, then the four groups in two columns with their row counts. */
export function SettingsDirectorySkeleton() {
  const groups = [STATIC_GROUPS[0].items.length, 2, STATIC_GROUPS[1].items.length, STATIC_GROUPS[2].items.length];
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <Skeleton className="h-9 max-w-sm" />
      <SettingsColumns>
        {groups.map((rows, g) => (
          <SettingsGroupSkeleton key={g} rows={rows} />
        ))}
      </SettingsColumns>
    </div>
  );
}
