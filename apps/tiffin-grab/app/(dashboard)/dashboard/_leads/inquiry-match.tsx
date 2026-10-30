"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, MapPinIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";
import { Button } from "@foundry/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@foundry/ui/popover";
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
  phone, sourceKey, pickedId, onPick, compact = false,
}: {
  phone: string;
  sourceKey: string;
  pickedId: string | null;
  onPick: (id: string | null, lockedSourceKey?: string) => void;
  /** One button beside a search bar instead of a card; the list opens in a popover. */
  compact?: boolean;
}) {
  // Keyed by phone so the empty state is derived, not set synchronously.
  const [found, setFound] = useState<{ phone: string; items: Match[] }>({ phone: "", items: [] });
  const autoPicked = useRef<string | null>(null);
  const term = phone.trim();
  const matches = found.phone === term ? found.items : [];

  useEffect(() => {
    if (term.length < 6) return;
    const t = setTimeout(async () => {
      try { setFound({ phone: term, items: await findInquiryMatches(term) }); }
      catch { setFound({ phone: term, items: [] }); }
    }, 400);
    return () => clearTimeout(t);
  }, [term]);

  // Always-reuse: a same-source open match auto-selects once.
  useEffect(() => {
    const same = matches.find((m) => m.sourceKey === sourceKey);
    if (same && pickedId == null && autoPicked.current !== same.publicId) {
      autoPicked.current = same.publicId;
      onPick(same.publicId, same.sourceKey);
    }
  }, [matches, sourceKey, pickedId, onPick]);

  if (matches.length === 0) return null;

  const heading = `${matches.length} open inquir${matches.length === 1 ? "y" : "ies"} for this number`;

  if (compact) {
    const using = matches.find((m) => m.publicId === pickedId);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="shrink-0" aria-label={heading}>
            <MapPinIcon />
            {using ? `${using.sourceLabel} · ${ageLabel(using.createdAt)}` : `${matches.length} inquir${matches.length === 1 ? "y" : "ies"}`}
            <ChevronDownIcon className="opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-80 gap-1.5 text-sm">
          <p className="text-muted-foreground text-xs font-medium">{heading}</p>
          {rows()}
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="border-border/70 grid gap-1.5 rounded-xl border p-3 text-sm">
      <p className="text-muted-foreground text-[0.7rem] font-semibold tracking-[0.08em] uppercase">
        {heading}
      </p>
      {rows()}
    </div>
  );

  function rows() {
    return (
      <>
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
      </>
    );
  }
}
