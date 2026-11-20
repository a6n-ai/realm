import type { ReactNode } from "react";
import { Badge } from "@foundry/ui/badge";

export type Tone = "neutral" | "ok" | "warn" | "bad" | "brand" | "faint";

const TONE_VAR: Record<Tone, string> = {
  neutral: "",
  ok: "[--ui-badge-tone:var(--ok)]",
  warn: "[--ui-badge-tone:var(--warn)]",
  bad: "[--ui-badge-tone:var(--bad)]",
  brand: "[--ui-badge-tone:var(--primary)]",
  faint: "",
};

/** Tinted status pill. Text always carries the meaning; the tone only helps the eye group rows. */
export function TonePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge variant="neutral" className={TONE_VAR[tone]}>
      {children}
    </Badge>
  );
}
