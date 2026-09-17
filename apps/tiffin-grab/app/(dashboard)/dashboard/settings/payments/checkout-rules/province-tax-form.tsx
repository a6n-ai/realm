"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PlusIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { SectionCard } from "@/components/ds";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import {
  DEFAULT_PROVINCE_TAXES,
  PROVINCES,
  PROVINCE_LABEL,
  type Province,
} from "@/lib/tax/canada";
import { setProvinceTaxesAction } from "./actions";

type Line = { name: string; rate: string };
type Draft = Record<Province, Line[]>;

const MAX_LINES = 4;

function toDraft(lines: { name: string; ratePct: number }[]): Line[] {
  return lines.map((l) => ({ name: l.name, rate: String(l.ratePct) }));
}

function sameAsDefault(p: Province, lines: Line[]): boolean {
  const d = DEFAULT_PROVINCE_TAXES[p];
  return (
    d.length === lines.length &&
    d.every((l, i) => l.name === lines[i]!.name.trim() && l.ratePct === Number(lines[i]!.rate))
  );
}

export function ProvinceTaxForm({ overrides }: { overrides: Record<string, { name: string; ratePct: number }[]> }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [draft, setDraft] = React.useState<Draft>(() => {
    const d = {} as Draft;
    for (const p of PROVINCES) d[p] = toDraft(overrides[p] ?? DEFAULT_PROVINCE_TAXES[p]);
    return d;
  });

  const update = (p: Province, lines: Line[]) => setDraft((prev) => ({ ...prev, [p]: lines }));

  const save = () => {
    const payload: Partial<Record<Province, { name: string; ratePct: number }[]>> = {};
    for (const p of PROVINCES) {
      // Store only provinces that differ from the defaults, so a province nobody
      // touched keeps following DEFAULT_PROVINCE_TAXES if those defaults change.
      if (sameAsDefault(p, draft[p])) continue;
      const lines = [];
      for (const l of draft[p]) {
        const rate = Number(l.rate);
        if (!l.name.trim()) return toast.error(`${PROVINCE_LABEL[p]}: every tax line needs a name`);
        if (l.rate.trim() === "" || !Number.isFinite(rate) || rate < 0 || rate > 100) {
          return toast.error(`${PROVINCE_LABEL[p]}: ${l.name || "a line"} needs a rate from 0 to 100`);
        }
        lines.push({ name: l.name.trim(), ratePct: rate });
      }
      payload[p] = lines;
    }
    start(async () => {
      try {
        await setProvinceTaxesAction(payload);
        toast.success("Provincial tax rates saved");
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to save");
      }
    });
  };

  return (
    <SectionCard
      title="Sales tax by province"
      subtitle="Tax is charged by the delivery address's province, on the order total after discounts and coins. Defaults are standard GST/HST/PST rates — confirm with your accountant whether prepared meals are taxable in each province, and set a line to 0% if it doesn't apply."
    >
      <div className="grid gap-4">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-xs">
                <th className="py-2 pr-3 font-medium">Province</th>
                <th className="py-2 pr-3 font-medium">Tax lines</th>
                <th className="py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {PROVINCES.map((p) => {
                const lines = draft[p];
                const total = lines.reduce((s, l) => s + (Number(l.rate) || 0), 0);
                const custom = !sameAsDefault(p, lines);
                return (
                  <tr key={p} className="border-b align-top last:border-0">
                    <td className="py-3 pr-3">
                      <div className="font-medium">{PROVINCE_LABEL[p]}</div>
                      <div className="text-muted-foreground text-xs">
                        {p}
                        {custom ? " · custom" : ""}
                      </div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="grid gap-2">
                        {lines.map((l, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Input
                              aria-label={`${PROVINCE_LABEL[p]} tax line ${i + 1} name`}
                              className="h-9 w-24"
                              value={l.name}
                              onChange={(e) => update(p, lines.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                            />
                            <div className="relative">
                              <Input
                                aria-label={`${PROVINCE_LABEL[p]} tax line ${i + 1} rate`}
                                type="number"
                                inputMode="decimal"
                                min={0}
                                max={100}
                                step="any"
                                className="h-9 w-24 pr-7 tabular-nums"
                                value={l.rate}
                                onChange={(e) => update(p, lines.map((x, j) => (j === i ? { ...x, rate: e.target.value } : x)))}
                              />
                              <span className="text-muted-foreground pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs">%</span>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9"
                              aria-label={`Remove ${l.name || "line"} from ${PROVINCE_LABEL[p]}`}
                              onClick={() => update(p, lines.filter((_, j) => j !== i))}
                            >
                              <XIcon className="size-4" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          {lines.length < MAX_LINES ? (
                            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => update(p, [...lines, { name: "", rate: "" }])}>
                              <PlusIcon className="size-3.5" /> Add line
                            </Button>
                          ) : null}
                          {custom ? (
                            <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => update(p, toDraft(DEFAULT_PROVINCE_TAXES[p]))}>
                              <RotateCcwIcon className="size-3.5" /> Reset to default
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-right font-medium tabular-nums">
                      {Math.round(total * 1000) / 1000}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Button onClick={save} disabled={pending} className="w-fit">
          Save tax rates
        </Button>
      </div>
    </SectionCard>
  );
}
