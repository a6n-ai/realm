"use client";

import { useCallback, useEffect, useState } from "react";
import { UsersIcon } from "lucide-react";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
// @realm/ui ships no checkbox; Switch is the existing toggle primitive.
import { Switch } from "@realm/ui/switch";
import { Skeleton } from "@realm/ui/skeleton";

export interface ContactListOption {
  publicId: string;
  name: string;
  consentSource: string;
  consentAt: number;
  memberCount: number;
}

export interface AudienceValue {
  segment?: {
    lastOrderAfter?: number;
    minOrderCount?: number;
    minTotalSpend?: number;
    requireVerifiedPhone?: boolean;
  };
  listIds?: string[];
}

const num = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() && Number.isFinite(n) ? n : undefined;
};

/**
 * Segment controls + list picker with a live count.
 *
 * The count comes from the same countAudience the send uses, so the number
 * shown here is the number that gets mailed — and the exclusions are spelled
 * out rather than silently applied, because a number that quietly drops people
 * reads as a bug to whoever is watching it.
 */
export function AudienceBuilder({
  lists,
  value,
  onChange,
  requiresVerifiedPhone,
}: {
  lists: ContactListOption[];
  value: AudienceValue;
  onChange: (v: AudienceValue) => void;
  requiresVerifiedPhone: boolean;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (audience: AudienceValue) => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/campaigns/audience-count", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(audience),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      setCount(data.count);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced so typing a spend threshold does not fire a query per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void refresh(value), 400);
    return () => clearTimeout(t);
  }, [value, refresh]);

  const setSegment = (patch: Partial<NonNullable<AudienceValue["segment"]>>) =>
    onChange({ ...value, segment: { ...value.segment, ...patch } });

  const toggleList = (id: string) => {
    const ids = new Set(value.listIds ?? []);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    onChange({ ...value, listIds: [...ids] });
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="minOrderCount">Min orders</Label>
          <Input
            id="minOrderCount"
            inputMode="numeric"
            placeholder="any"
            defaultValue={value.segment?.minOrderCount ?? ""}
            onChange={(e) => setSegment({ minOrderCount: num(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minTotalSpend">Min total spend</Label>
          <Input
            id="minTotalSpend"
            inputMode="decimal"
            placeholder="any"
            defaultValue={value.segment?.minTotalSpend ?? ""}
            onChange={(e) => setSegment({ minTotalSpend: num(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastOrderAfter">Ordered since</Label>
          <Input
            id="lastOrderAfter"
            type="date"
            onChange={(e) =>
              setSegment({
                lastOrderAfter: e.target.value ? new Date(e.target.value).getTime() : undefined,
              })
            }
          />
        </div>
      </div>

      {requiresVerifiedPhone && (
        <label className="flex items-start gap-2 text-sm">
          <Switch
            checked={value.segment?.requireVerifiedPhone ?? true}
            onCheckedChange={(c) => setSegment({ requireVerifiedPhone: c })}
          />
          <span>
            Only verified phone numbers
            <span className="block text-xs text-muted-foreground">
              An unverified number came off a delivery form and may be mistyped — a marketing
              message would reach someone who never consented.
            </span>
          </span>
        </label>
      )}

      <div className="space-y-2">
        <Label>Contact lists</Label>
        {lists.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contact lists yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {lists.map((l) => (
              <li key={l.publicId}>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={(value.listIds ?? []).includes(l.publicId)}
                    onCheckedChange={() => toggleList(l.publicId)}
                  />
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {l.memberCount} · {l.consentSource.replace(/_/g, " ")} ·{" "}
                    {new Date(l.consentAt).toLocaleDateString()}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-lg border p-3 text-sm">
        <UsersIcon className="size-4 text-muted-foreground" />
        {loading || count === null ? (
          <Skeleton className="h-4 w-40" />
        ) : (
          <span>
            <span className="font-semibold tabular-nums">{count}</span> recipients after removing
            suppressed addresses, unsubscribes and lapsed consent.
          </span>
        )}
      </div>
    </div>
  );
}
