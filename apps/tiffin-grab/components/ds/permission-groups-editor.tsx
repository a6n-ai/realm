"use client";

import type { PermissionMap, ResourceLabel } from "@foundry/crm";
import { ChevronDownIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@foundry/ui/collapsible";
import { Switch } from "@foundry/ui/switch";
import { GroupHeading } from "@/components/ds/group-heading";
import { SwitchList, type SwitchRow } from "@/components/ds/switch-list";
import { ActionIcon } from "@/components/ds/action-icon";
import { groupResources, type PermissionGroup } from "@/lib/auth/permission-groups";

type Grantable = PermissionMap;

/** On and total actions across the areas of one group. */
export function groupCounts(value: PermissionMap, items: readonly ResourceLabel[]) {
  const on = items.reduce((n, r) => n + r.actions.filter((a) => value[r.resource]?.includes(a.action)).length, 0);
  const total = items.reduce((n, r) => n + r.actions.length, 0);
  return { on, total };
}

function withAction(value: PermissionMap, resource: string, action: string, on: boolean): PermissionMap {
  const current = value[resource] ?? [];
  const next = on ? (current.includes(action) ? current : [...current, action]) : current.filter((a) => a !== action);
  const { [resource]: _drop, ...rest } = value;
  return next.length ? { ...rest, [resource]: next } : rest;
}

/** Sets every grantable action in the areas on or off. Ungrantable actions are never added, and never removed. */
export function toggleGroup(value: PermissionMap, items: readonly ResourceLabel[], on: boolean, grantable: Grantable): PermissionMap {
  return items
    .flatMap((r) => r.actions.map((a) => [r.resource, a.action] as const))
    .filter(([resource, action]) => grantable[resource]?.includes(action))
    .reduce((acc, [resource, action]) => withAction(acc, resource, action, on), value);
}

/** Keys of the groups that have at least one action on, for the editor's initial open state. */
export function groupsWithAnyOn(value: PermissionMap, resources: readonly ResourceLabel[]): PermissionGroup["key"][] {
  return groupResources(resources)
    .filter(({ items }) => groupCounts(value, items).on > 0)
    .map(({ group }) => group.key);
}

/** Collapsible permission groups. Groups in defaultOpen start expanded; everything else starts collapsed. */
export function PermissionGroupsEditor({
  value,
  onChange,
  resources,
  grantable,
  readOnly = false,
  defaultOpen = [],
}: {
  value: PermissionMap;
  onChange: (next: PermissionMap) => void;
  resources: ResourceLabel[];
  grantable: Grantable;
  readOnly?: boolean;
  defaultOpen?: PermissionGroup["key"][];
}) {
  return (
    <div className="grid content-start gap-6">
      {groupResources(resources).map(({ group, items }) => {
        const { on, total } = groupCounts(value, items);
        const grantableIds = items.flatMap((r) =>
          r.actions.filter((a) => grantable[r.resource]?.includes(a.action)).map((a) => [r.resource, a.action] as const),
        );
        const allOn = grantableIds.length > 0 && grantableIds.every(([resource, action]) => value[resource]?.includes(action));
        return (
          <Collapsible key={group.key} defaultOpen={defaultOpen.includes(group.key)} className="grid gap-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <GroupHeading group={group} trailing={<span className="text-xs text-muted-foreground tabular-nums">{on} of {total} on</span>} />
              </div>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <Switch
                  aria-label={`All ${group.label}`}
                  checked={allOn}
                  disabled={readOnly || grantableIds.length === 0}
                  onCheckedChange={(next) => onChange(toggleGroup(value, items, next, grantable))}
                />
                All
              </label>
              <CollapsibleTrigger
                aria-label={`Show ${group.label}`}
                className="group/trigger inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <ChevronDownIcon className="size-4 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180" aria-hidden />
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="grid items-start gap-6 md:grid-cols-2">
              {items.map((r) => {
                const areaOn = groupCounts(value, [r]).on;
                const rows: SwitchRow[] = r.actions.map((a) => {
                  const allowed = grantable[r.resource]?.includes(a.action) ?? false;
                  return {
                    id: `${r.resource}.${a.action}`,
                    label: a.label,
                    icon: <ActionIcon action={a.action} />,
                    checked: value[r.resource]?.includes(a.action) ?? false,
                    disabled: readOnly || !allowed,
                    tooltip: !readOnly && !allowed ? "You don't hold this permission" : undefined,
                    onChange: (next) => onChange(toggleGroup(value, [{ ...r, actions: [a] }], next, grantable)),
                  };
                });
                return (
                  <section key={r.resource} className="grid gap-2" aria-label={r.label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <h4 className="text-sm font-medium">{r.label}</h4>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {areaOn} of {r.actions.length} on
                      </span>
                    </div>
                    <SwitchList rows={rows} />
                  </section>
                );
              })}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
