"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadAssignmentConfig, Strategy } from "@/lib/services/assignment";
import { saveLeadAssignment } from "./actions";

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: "creator", label: "Creator" },
  { value: "round_robin", label: "Round robin" },
  { value: "percentage", label: "Percentage" },
];

const DEFAULT_OVERRIDE = "__default__";

type Source = { key: string; label: string; isInbound: boolean };
type Member = { publicId: string; name: string | null };

export function LeadAssignmentForm({
  cfg,
  sources,
  members,
}: {
  cfg: LeadAssignmentConfig;
  sources: Source[];
  members: Member[];
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<Strategy>(cfg.strategy);
  const [perSource, setPerSource] = useState<Record<string, Strategy>>(cfg.perSource);
  const [weights, setWeights] = useState<Record<string, string>>(
    Object.fromEntries(members.map((m) => [m.publicId, String(cfg.weights[m.publicId] ?? 1)])),
  );
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

  const save = () => {
    const parsedWeights: Record<string, number> = {};
    for (const m of members) {
      const raw = weights[m.publicId];
      const n = Number(raw);
      if (raw === "" || Number.isNaN(n) || n < 0) {
        setError(`Weight for ${m.name ?? m.publicId} must be a non-negative number`);
        return;
      }
      parsedWeights[m.publicId] = n;
    }
    start(async () => {
      setError(null);
      try {
        await saveLeadAssignment({
          strategy,
          perSource,
          weights: parsedWeights,
          cursor: cfg.cursor,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <div className="grid max-w-xl gap-6">
      {error && <p className="text-destructive text-sm">{error}</p>}

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
        <Label>Per-source overrides</Label>
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

      <div className="grid gap-2">
        <Label>Percentage weights</Label>
        <p className="text-muted-foreground text-xs">Relative weight per accepts-leads member (used by the percentage strategy).</p>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">No accepts-leads members.</p>
        ) : (
          members.map((m) => (
            <div key={m.publicId} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <span className="text-sm">{m.name ?? m.publicId}</span>
              <Input
                type="number"
                min={0}
                step={1}
                className="w-28"
                value={weights[m.publicId] ?? ""}
                onChange={(e) => setWeights((prev) => ({ ...prev, [m.publicId]: e.target.value }))}
              />
            </div>
          ))
        )}
      </div>

      <Button onClick={save} disabled={pending} className="w-fit">Save</Button>
    </div>
  );
}
