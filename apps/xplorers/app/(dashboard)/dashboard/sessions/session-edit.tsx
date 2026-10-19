"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { PriceTableEditor } from "@/components/dashboard/price-table-editor";
import { offeredLengths } from "@/lib/pricing/resolve";
import type { ClassPricing, PriceTable } from "@/lib/pricing/types";
import { cancelSessionAction, updateSessionAction } from "./session-actions";

const minutesLabel = (m: number) => (m % 60 === 0 ? `${m / 60} hr` : `${m} min`);

type Props = {
  publicId: string;
  occursOn: string;
  startsAtLocal: string;
  endsAtLocal: string;
  capacity: number;
  prices: PriceTable;
  inherited: PriceTable;
  pricing: ClassPricing;
  cancelled: boolean;
};

export function SessionEdit(props: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [occursOn, setOccursOn] = useState(props.occursOn);
  const [startsAt, setStartsAt] = useState(props.startsAtLocal);
  const [endsAt, setEndsAt] = useState(props.endsAtLocal);
  const [capacity, setCapacity] = useState(String(props.capacity));
  const [prices, setPrices] = useState<PriceTable>(props.prices);
  const [confirmMove, setConfirmMove] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const windowMinutes = Math.max(0, Math.round((Date.parse(`${endsAt}:00Z`) - Date.parse(`${startsAt}:00Z`)) / 60_000));
  const keys =
    props.pricing.mode === "options"
      ? props.pricing.options.map((o) => ({ key: `opt:${o.key}`, label: o.label || o.key }))
      : offeredLengths(props.pricing, props.inherited, windowMinutes).map((m) => ({ key: `len:${m}`, label: minutesLabel(m) }));
  const offered = new Set(keys.map((k) => k.key));
  const livePrices = Object.fromEntries(Object.entries(prices).filter(([k]) => offered.has(k) || k === "ext"));

  const save = (confirm: boolean) =>
    start(async () => {
      const fd = new FormData();
      fd.set("occursOn", occursOn);
      fd.set("startsAt", startsAt);
      fd.set("endsAt", endsAt);
      fd.set("capacity", capacity);
      fd.set("prices", JSON.stringify(livePrices));
      const res = await updateSessionAction(props.publicId, confirm, {}, fd);
      setConfirmMove(null);
      if (res.error) {
        if (!confirm && res.error.includes("Confirm to continue")) setConfirmMove(res.error);
        else toast.error(res.error);
        return;
      }
      toast.success("Session saved");
      router.refresh();
    });

  const cancel = () =>
    start(async () => {
      const res = await cancelSessionAction(props.publicId, true);
      setConfirmCancel(false);
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Session cancelled (${res.cancelled ?? 0} bookings)`);
        router.refresh();
      }
    });

  if (props.cancelled) return <p className="text-muted-foreground text-sm">This session is cancelled.</p>;

  return (
    <div className="grid max-w-xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="occursOn">Date</Label>
          <Input id="occursOn" type="date" value={occursOn} onChange={(e) => setOccursOn(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="capacity">Capacity</Label>
          <Input id="capacity" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="startsAt">Starts</Label>
          <Input id="startsAt" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endsAt">Ends</Label>
          <Input id="endsAt" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </div>
      </div>
      {keys.length > 0 ? (
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Prices for this session</h3>
          <p className="text-muted-foreground text-xs">Leave blank to use the class or studio price (shown faintly).</p>
          <PriceTableEditor keys={keys} value={prices} onChange={setPrices} inherited={props.inherited} />
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={pending} onClick={() => save(false)}>
          {pending ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setConfirmCancel(true)}>
          Cancel session
        </Button>
      </div>

      <Dialog open={confirmMove !== null} onOpenChange={(o) => !o && setConfirmMove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move this session?</DialogTitle>
            <DialogDescription>{confirmMove}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmMove(null)}>
              Keep as is
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => save(true)}>
              Move and cancel bookings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this session?</DialogTitle>
            <DialogDescription>Any bookings are cancelled and each parent is notified.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCancel(false)}>
              Keep session
            </Button>
            <Button variant="destructive" disabled={pending} onClick={cancel}>
              Cancel session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
