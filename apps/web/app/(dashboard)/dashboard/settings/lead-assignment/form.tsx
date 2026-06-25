"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadAssignmentConfig, Strategy } from "@/lib/services/assignment";
import { saveMembership, saveStrategy } from "./actions";

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: "creator", label: "Creator" },
  { value: "round_robin", label: "Round robin" },
  { value: "percentage", label: "Percentage" },
];

const DEFAULT_OVERRIDE = "__default__";
const DEFAULT_POOL_KEY = "";

type Source = { key: string; label: string; isInbound: boolean };
type StaffOption = { userId: string; publicId: string; name: string | null };
type MemberRow = { userId: string; weight: number };

export function LeadAssignmentForm({
  cfg,
  sources,
  staff,
  membership,
}: {
  cfg: LeadAssignmentConfig;
  sources: Source[];
  staff: StaffOption[];
  membership: Record<string, MemberRow[]>;
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<Strategy>(cfg.strategy);
  const [perSource, setPerSource] = useState<Record<string, Strategy>>(cfg.perSource);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setOverride = (key: string, value: string) => {
    setPerSource((prev) => {
      const next = { ...prev };
      if (value === DEFAULT_OVERRIDE) delete next[key];
      else next[key] = value as Strategy;
      return next;
    });
  };

  const saveStrategies = () => {
    start(async () => {
      setError(null);
      try {
        await saveStrategy(strategy, perSource);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  const staffName = (userId: string) => {
    const s = staff.find((o) => o.userId === userId);
    return s ? s.name ?? s.publicId : userId;
  };

  // The pseudo-sources rendered with a membership editor: each inbound source plus the default pool.
  const pools: { key: string; sourceKey: string | null; label: string; allowOverride: boolean }[] = [
    ...sources.map((src) => ({ key: src.key, sourceKey: src.key, label: src.label, allowOverride: true })),
    { key: DEFAULT_POOL_KEY, sourceKey: null, label: "Default pool (fallback)", allowOverride: false },
  ];

  return (
    <div className="grid gap-8">
      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="grid max-w-xl gap-4">
        <div>
          <Label>Global strategy</Label>
          <Select value={strategy} onValueChange={(v) => setStrategy(v as Strategy)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STRATEGIES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-muted-foreground mt-1 text-xs">Default routing for inbound inquiries with no per-source override.</p>
        </div>

        <div className="grid gap-2">
          <Label>Per-source strategy overrides</Label>
          {sources.length === 0 ? (
            <p className="text-muted-foreground text-sm">No inbound lead sources configured.</p>
          ) : (
            sources.map((src) => (
              <div key={src.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <span className="text-sm">{src.label}</span>
                <Select
                  value={perSource[src.key] ?? DEFAULT_OVERRIDE}
                  onValueChange={(v) => setOverride(src.key, v)}
                >
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_OVERRIDE}>Default (global)</SelectItem>
                    {STRATEGIES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </div>

        <Button onClick={saveStrategies} disabled={pending} className="w-fit">Save strategy</Button>
      </div>

      <div className="grid gap-6">
        <div>
          <Label>Pool membership</Label>
          <p className="text-muted-foreground text-xs">
            Members eligible for round-robin / percentage routing per source. The default pool is the fallback when a source has no members.
          </p>
        </div>
        {pools.map((pool) => (
          <PoolEditor
            key={pool.key || "__default_pool__"}
            label={pool.label}
            sourceKey={pool.sourceKey}
            staff={staff}
            staffName={staffName}
            initial={membership[pool.key] ?? []}
            onSaved={() => router.refresh()}
          />
        ))}
      </div>
    </div>
  );
}

function PoolEditor({
  label,
  sourceKey,
  staff,
  staffName,
  initial,
  onSaved,
}: {
  label: string;
  sourceKey: string | null;
  staff: StaffOption[];
  staffName: (userId: string) => string;
  initial: MemberRow[];
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<MemberRow[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const used = new Set(rows.map((r) => r.userId));
  const available = staff.filter((s) => !used.has(s.userId));

  const addRow = () => {
    const next = available[0];
    if (!next) return;
    setRows((prev) => [...prev, { userId: next.userId, weight: 1 }]);
  };

  const removeRow = (idx: number) => setRows((prev) => prev.filter((_, i) => i !== idx));

  const setRowUser = (idx: number, userId: string) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, userId } : r)));

  const setRowWeight = (idx: number, weight: number) =>
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, weight } : r)));

  const save = () => {
    for (const r of rows) {
      if (!Number.isFinite(r.weight) || r.weight < 0) {
        setError(`Weight for ${staffName(r.userId)} must be a non-negative number`);
        return;
      }
    }
    start(async () => {
      setError(null);
      try {
        await saveMembership(sourceKey, rows);
        onSaved();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button variant="outline" size="sm" onClick={addRow} disabled={available.length === 0}>
          <PlusIcon className="size-4" /> Add member
        </Button>
      </div>
      {error && <p className="text-destructive mb-2 text-sm">{error}</p>}
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No members.</p>
      ) : (
        <div className="grid gap-2">
          {rows.map((row, idx) => {
            const options = staff.filter((s) => s.userId === row.userId || !used.has(s.userId));
            return (
              <div key={`${row.userId}-${idx}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                <Select value={row.userId} onValueChange={(v) => setRowUser(idx, v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {options.map((o) => (
                      <SelectItem key={o.userId} value={o.userId}>{o.name ?? o.publicId}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className="w-24"
                  value={String(row.weight)}
                  onChange={(e) => setRowWeight(idx, Number(e.target.value))}
                />
                <Button variant="ghost" size="icon" onClick={() => removeRow(idx)} aria-label="Remove member">
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            );
          })}
        </div>
      )}
      <Button onClick={save} disabled={pending} size="sm" className="mt-3 w-fit">Save members</Button>
    </div>
  );
}
