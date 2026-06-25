"use client";
import { useEffect, useRef, useState } from "react";
import { MapPinIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { findInquiryMatches } from "./match-actions";

type Match = { publicId: string; sourceKey: string; sourceLabel: string; stage: string; createdAt: number };

function ageLabel(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export function InquiryMatch({
  phone, sourceKey, pickedId, onPick,
}: {
  phone: string;
  sourceKey: string;
  pickedId: string | null;
  onPick: (id: string | null, lockedSourceKey?: string) => void;
}) {
  const [matches, setMatches] = useState<Match[]>([]);
  const autoPicked = useRef<string | null>(null);

  useEffect(() => {
    const p = phone.trim();
    if (p.length < 6) { setMatches([]); return; }
    const t = setTimeout(async () => {
      try { setMatches(await findInquiryMatches(p)); } catch { setMatches([]); }
    }, 400);
    return () => clearTimeout(t);
  }, [phone]);

  // Always-reuse: a same-source open match auto-selects once.
  useEffect(() => {
    const same = matches.find((m) => m.sourceKey === sourceKey);
    if (same && pickedId == null && autoPicked.current !== same.publicId) {
      autoPicked.current = same.publicId;
      onPick(same.publicId, same.sourceKey);
    }
  }, [matches, sourceKey, pickedId, onPick]);

  if (matches.length === 0) return null;

  return (
    <div className="border-border/70 grid gap-1.5 rounded-xl border p-3 text-sm">
      <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
        {matches.length} open inquir{matches.length === 1 ? "y" : "ies"} for this number
      </p>
      {matches.map((m) => {
        const active = pickedId === m.publicId;
        return (
          <button
            key={m.publicId}
            type="button"
            onClick={() => onPick(m.publicId, m.sourceKey)}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
              active ? "border-primary/30 bg-primary/10" : "border-border hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-2">
              <MapPinIcon className="text-muted-foreground size-3.5" />
              <span className="font-medium">{m.sourceLabel}</span>
              <span className="text-muted-foreground">· {m.stage} · {ageLabel(m.createdAt)}</span>
            </span>
            <span className={cn("text-xs font-medium", active ? "text-primary" : "text-muted-foreground")}>
              {active ? "Using" : "Use this"}
            </span>
          </button>
        );
      })}
      {pickedId && (
        <button type="button" onClick={() => onPick(null)} className="text-muted-foreground hover:text-foreground justify-self-start text-xs underline underline-offset-2">
          Create new inquiry instead
        </button>
      )}
    </div>
  );
}
