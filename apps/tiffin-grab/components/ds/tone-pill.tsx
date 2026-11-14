import type { ReactNode } from "react";
import { cn } from "@foundry/ui/cn";

export type Tone = "neutral" | "ok" | "warn" | "bad" | "brand" | "faint";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
  brand: "bg-primary/15 text-primary",
  faint: "text-muted-foreground border border-dashed",
};

/** Tinted status pill. Text always carries the meaning; the tone only helps the eye group rows. */
export function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[tone])}>
      {children}
    </span>
  );
}
