"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { EllipsisIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { toast } from "sonner";
import type { PluginCatalogStatus } from "@foundry/crm";
import { Skeleton } from "@foundry/ui/skeleton";
import { Card, EmptyState, SearchInput } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { Button } from "@foundry/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@foundry/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PLUGIN_CATEGORIES, PLUGIN_DISPLAY, PLUGIN_METAS, type PluginCategory } from "@/lib/plugins";
import type { PluginMeta } from "@foundry/crm";
import { IconTile, IconTileSkeleton } from "../_components/icon-tile";
import { setPluginInstalledAction } from "./actions";

type Filter = "all" | "installed" | PluginCategory;

const categoryOf = (m: PluginMeta): PluginCategory => PLUGIN_DISPLAY[m.id]?.category ?? "Operations";

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
          <section key={s.title ?? "results"} className="flex flex-col gap-3">
            {s.title ? (
              <h2 className="text-sm font-semibold tracking-tight">
                {s.title} <span className="text-muted-foreground font-normal tabular-nums">{s.items.length}</span>
              </h2>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {s.items.map((m) => (
                <PluginCard key={m.id} meta={m} status={statuses[m.id] ?? { installed: false }} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function PluginCard({ meta, status }: { meta: PluginMeta; status: PluginCatalogStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const display = PLUGIN_DISPLAY[meta.id];

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
    <Card variant="flat" className="h-full gap-0 p-0">
      <div className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <IconTile icon={meta.icon} tone={display?.tone ?? "gray"} logo={meta.logo} size="lg" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h3 className="text-sm font-semibold tracking-tight">{meta.label}</h3>
            <span className="text-muted-foreground text-xs">{categoryOf(meta)}</span>
          </div>
          {status.installed ? (
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
          ) : null}
        </div>

        <p className="text-muted-foreground line-clamp-2 flex-1 text-sm">{meta.description}</p>

        <div className="flex items-center justify-between gap-2">
          {status.installed ? (
            <Badge variant={statusVariant(status.statusLabel)}>{status.statusLabel ?? "Installed"}</Badge>
          ) : (
            <span />
          )}
          {!status.installed ? (
            <Button size="sm" disabled={pending} onClick={() => setInstalled(true)}>
              <PlusIcon data-icon="inline-start" />
              {pending ? "Installing..." : "Install"}
            </Button>
          ) : meta.settingsHref ? (
            <Button size="sm" variant="outline" asChild>
              <Link href={meta.settingsHref}>Open</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
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
      <section className="flex flex-col gap-3">
        <Skeleton className="h-5 w-24" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PLUGIN_METAS.map((m) => (
            <Card key={m.id} variant="flat" className="h-full gap-0 p-0">
              <div className="flex h-full flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <IconTileSkeleton size="lg" />
                  <div className="flex flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-2/3" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-5 w-20 rounded-full" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
