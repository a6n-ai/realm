"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { PriceTableEditor } from "@/components/dashboard/price-table-editor";
import type { PriceTable } from "@/lib/pricing/types";
import { saveDefaultPrices } from "./actions";

const lenOf = (key: string) => Number(key.slice(4));
const label = (m: number) => `${m} min`;

export function PricingForm({ initial }: { initial: PriceTable }) {
  const router = useRouter();
  const [table, setTable] = useState<PriceTable>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const lengths = Object.keys(table).sort((a, b) => lenOf(a) - lenOf(b));

  const add = () => {
    const next = lengths.length ? lenOf(lengths[lengths.length - 1]!) + 30 : 90;
    setTable({ ...table, [`len:${next}`]: {} });
  };
  const remove = () => {
    const last = lengths[lengths.length - 1];
    if (!last) return;
    const { [last]: _drop, ...rest } = table;
    setTable(rest);
  };

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      try {
        await saveDefaultPrices(table);
        setSaved(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save");
      }
    });

  return (
    <div className="grid max-w-xl gap-4">
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {lengths.length === 0 ? (
        <p className="text-muted-foreground text-sm">No lengths yet. Add one to start.</p>
      ) : (
        <PriceTableEditor
          keys={lengths.map((key) => ({ key, label: label(lenOf(key)) }))}
          value={table}
          onChange={setTable}
          keepBlankRows
        />
      )}
      <div className="flex items-center gap-2">
        <Button variant="outline" onClick={add}>
          <PlusIcon /> Add 30 min
        </Button>
        <Button variant="outline" onClick={remove} disabled={lengths.length === 0}>
          <Trash2Icon /> Remove longest
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending} className="w-fit">
          Save
        </Button>
        {saved ? <span className="text-muted-foreground text-xs">Saved</span> : null}
      </div>
    </div>
  );
}
