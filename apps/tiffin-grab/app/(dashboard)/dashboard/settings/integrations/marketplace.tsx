"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EllipsisIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { toast } from "sonner";
import type { PluginCatalogStatus } from "@foundry/crm";
import { Skeleton } from "@foundry/ui/skeleton";
import { EmptyState, SearchInput } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PLUGIN_CATEGORIES, PLUGIN_METAS, type PluginCategory } from "@/lib/plugins";
import type { PluginMeta } from "@foundry/crm";
import { IconTile } from "../_components/icon-tile";
import { CatalogCard, CatalogShelf, CatalogShelfSkeleton } from "../_components/catalog-card";
import { setPluginInstalledAction } from "./actions";

type Filter = "all" | "installed" | PluginCategory;

const categoryOf = (m: PluginMeta): PluginCategory => m.category ?? "Operations";

export function Marketplace({ statuses }: { statuses: Record<string, PluginCatalogStatus> }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const isInstalled = (m: PluginMeta) => Boolean(statuses[m.id]?.installed);

  const q = query.trim().toLowerCase();
  const matches = PLUGIN_METAS.filter(
    (m) =>
      (!q || `${m.label} ${m.description} ${categoryOf(m)}`.toLowerCase().includes(q)) &&
      (filter === "all" || (filter === "installed" ? isInstalled(m) : categoryOf(m) === filter)),
  );

  // Unfiltered, the page reads like a store: what you have first, then what you can add.
  const shelves =
    filter === "all" && !q
      ? [
          { title: "Installed", items: matches.filter(isInstalled) },
          { title: "Available", items: matches.filter((m) => !isInstalled(m)) },
        ].filter((s) => s.items.length)
      : [{ title: null, items: matches }];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-72">
          <SearchInput value={query} onChange={setQuery} placeholder="Search plugins" />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={filter}
          onValueChange={(v) => v && setFilter(v as Filter)}
          aria-label="Filter plugins"
        >
          <ToggleGroupItem value="all">All</ToggleGroupItem>
          <ToggleGroupItem value="installed">Installed</ToggleGroupItem>
          {PLUGIN_CATEGORIES.map((c) => (
            <ToggleGroupItem key={c} value={c}>
              {c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {matches.length === 0 ? (
        <EmptyState
          icon={SearchXIcon}
          message={filter === "installed" && !q ? "No plugins installed yet." : "No plugin matches that."}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Show all plugins
            </Button>
          }
        />
      ) : (
        shelves.map((s) => (
          <CatalogShelf key={s.title ?? "results"} title={s.title} count={s.items.length}>
            {s.items.map((m) => (
              <PluginCard key={m.id} meta={m} status={statuses[m.id] ?? { installed: false }} />
            ))}
          </CatalogShelf>
        ))
      )}
    </div>
  );
}

function PluginCard({ meta, status }: { meta: PluginMeta; status: PluginCatalogStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const setInstalled = (installed: boolean) =>
    start(async () => {
      const res = await setPluginInstalledAction(meta.id, installed);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
      if (installed) {
        toast.success(`${meta.label} installed`, meta.settingsHref ? { action: { label: "Set up", onClick: () => router.push(meta.settingsHref!) } } : undefined);
      } else {
        // Removing keeps the plugin's saved settings, so Undo is a real undo.
        toast.success(`${meta.label} removed`, { action: { label: "Undo", onClick: () => setInstalled(true) } });
      }
    });

  return (
    <CatalogCard
      tile={<IconTile icon={meta.icon} tone={meta.tone ?? "gray"} logo={meta.logo} size="lg" />}
      title={meta.label}
      category={categoryOf(meta)}
      description={meta.description}
      menu={
        status.installed ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`More for ${meta.label}`} disabled={pending}>
                <EllipsisIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={() => setInstalled(false)}>
                Remove plugin
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
      status={status.installed ? <Badge variant={statusVariant(status.statusLabel)}>{status.statusLabel ?? "Installed"}</Badge> : null}
      action={
        !status.installed ? (
          <Button size="sm" disabled={pending} onClick={() => setInstalled(true)}>
            <PlusIcon data-icon="inline-start" />
            {pending ? "Installing..." : "Install"}
          </Button>
        ) : meta.settingsHref ? (
          <Button size="sm" variant="outline" asChild>
            <Link href={meta.settingsHref}>Open</Link>
          </Button>
        ) : null
      }
    />
  );
}

/** Plugins report free-text labels; anything that names a gap is a warning. */
function statusVariant(label: string | undefined): "success-light" | "warning-light" | "info-light" {
  if (!label || /connected|installed|enabled/i.test(label)) return "success-light";
  if (/missing|not |error|disconnected/i.test(label)) return "warning-light";
  return "info-light";
}

export function MarketplaceSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 sm:w-72" />
        <Skeleton className="h-8 w-80" />
      </div>
      <CatalogShelfSkeleton cards={PLUGIN_METAS.length} />
    </div>
  );
}
