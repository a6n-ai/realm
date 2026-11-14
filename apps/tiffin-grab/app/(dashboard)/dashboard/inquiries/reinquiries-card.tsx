"use client";

import { useState } from "react";
import Link from "next/link";
import { FlameIcon, RepeatIcon, SnowflakeIcon, SunIcon, type LucideIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { Tabs, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { Badge } from "@/components/reui/badge";
import { displayName } from "@/lib/inquiries/display";
import { REINQUIRY_HEATS, type ReinquiryHeat } from "@/lib/inquiries/reinquiry-heat";
import { ago } from "./follow-up-badge";

export type ReinquiryCardRow = {
  publicId: string;
  fullName: string | null;
  phone: string | null;
  count: number;
  lastAt: number;
  sourceLabel: string | null;
  subSource: string | null;
  heat: ReinquiryHeat;
};

const HEAT: Record<ReinquiryHeat, { label: string; icon: LucideIcon; empty: string }> = {
  hot: { label: "Hot", icon: FlameIcon, empty: "No hot re-inquiries. Leads that came back twice this week, or through an ad or the website, show here." },
  warm: { label: "Warm", icon: SunIcon, empty: "No warm re-inquiries in the last 30 days." },
  cold: { label: "Cold", icon: SnowflakeIcon, empty: "No cold re-inquiries." },
};

/** Leads that came back to us, kept apart from first-time inquiries, split by how keen they look. */
export function ReinquiriesCard({ rows, now }: { rows: ReinquiryCardRow[]; now: number }) {
  const counts = Object.fromEntries(REINQUIRY_HEATS.map((h) => [h, rows.filter((r) => r.heat === h).length])) as Record<ReinquiryHeat, number>;
  const [heat, setHeat] = useState<ReinquiryHeat>(REINQUIRY_HEATS.find((h) => counts[h] > 0) ?? "hot");
  const shown = rows.filter((r) => r.heat === heat);
  return (
    <div className="flex flex-col gap-3">
      <Tabs value={heat} onValueChange={(v) => setHeat(v as ReinquiryHeat)}>
        <TabsList variant="line" aria-label="Re-inquiries by heat">
          {REINQUIRY_HEATS.map((h) => {
            const { label, icon: Icon } = HEAT[h];
            return (
              <TabsTrigger key={h} value={h} className="gap-1.5">
                <Icon aria-hidden />
                {label}
                <Badge variant={h === "hot" && counts.hot > 0 ? "destructive-light" : "secondary"} className="tabular-nums">{counts[h]}</Badge>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      {shown.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <RepeatIcon className="size-4" aria-hidden />
          {HEAT[heat].empty}
        </p>
      ) : (
        <ul className="divide-border flex flex-col divide-y">
          {shown.map((r) => (
            <li key={r.publicId}>
              <Link href={`/dashboard/inquiries/${r.publicId}`} className="hover:bg-muted/50 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-2.5 transition-colors">
                <span className="min-w-0 truncate text-sm font-medium">{displayName(r)}</span>
                {r.phone && <span className="text-muted-foreground text-xs tabular-nums">{formatPhone(r.phone)}</span>}
                <span className="ml-auto flex items-center gap-2">
                  {r.sourceLabel && <Badge variant="secondary">via {r.sourceLabel}{r.subSource ? ` · ${r.subSource}` : ""}</Badge>}
                  <Badge variant="info-light" className="tabular-nums">{r.count}×</Badge>
                  <span className="text-muted-foreground text-xs tabular-nums">{ago(r.lastAt, now)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
