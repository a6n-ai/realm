"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@realm/ui/cn";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { Skeleton } from "@realm/ui/skeleton";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@realm/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@realm/ui/table";
import {
  DELIVERY_STATUS_LABEL,
  DELIVERY_STATUS_VARIANT,
  type DeliveryRow,
} from "./deliveries-panel-columns";
import {
  editDeliveryAddress,
  pauseDeliveryRange,
  resumeDeliveryRangeAction,
  skipDeliveryAction,
  unskipDeliveryAction,
} from "./actions";

const VARIANT_CLASS: Record<string, string> = {
  neutral: "bg-muted text-muted-foreground border",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  bad: "bg-bad/15 text-bad",
};

function DeliveryStatusBadge({ status }: { status: DeliveryRow["status"] }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", VARIANT_CLASS[DELIVERY_STATUS_VARIANT[status]])}>
      {DELIVERY_STATUS_LABEL[status]}
    </span>
  );
}

function EditAddressDialog({
  orderId,
  deliveryPublicId,
  address,
  disabled,
}: {
  orderId: string;
  deliveryPublicId: string;
  address: DeliveryRow["address"];
  disabled: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState(address.fullName);
  const [addressLine, setAddressLine] = useState(address.addressLine);
  const [city, setCity] = useState(address.city);
  const [postalCode, setPostalCode] = useState(address.postalCode);

  function confirm() {
    start(async () => {
      try {
        await editDeliveryAddress(orderId, deliveryPublicId, { fullName, addressLine, city, postalCode });
        setOpen(false);
        router.refresh();
        toast("Address updated");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to update address");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>Edit address</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit delivery address</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <Input placeholder="Address line" value={addressLine} onChange={(e) => setAddressLine(e.target.value)} />
          <Input placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
          <Input placeholder="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={pending}>Cancel</Button>
          </DialogClose>
          <Button disabled={pending} onClick={confirm}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeliveriesPanel({ orderId, deliveries }: { orderId: string; deliveries: DeliveryRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");

  function run(fn: () => Promise<void>) {
    start(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded-md border bg-transparent px-2 py-1 text-sm"
        />
        <span className="text-muted-foreground text-sm">to</span>
        <input
          type="date"
          value={until}
          onChange={(e) => setUntil(e.target.value)}
          className="rounded-md border bg-transparent px-2 py-1 text-sm"
        />
        <Button
          variant="secondary"
          size="sm"
          disabled={pending || !from || !until}
          onClick={() => run(() => pauseDeliveryRange(orderId, { from, until }))}
        >
          Pause range
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => resumeDeliveryRangeAction(orderId))}
        >
          Resume
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Address</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {deliveries.map((d) => {
            const locked = Date.now() > d.cutoffAt;
            return (
              <TableRow key={d.publicId} className={cn(locked && "opacity-60")}>
                <TableCell>
                  {d.deliveryDate}
                  {d.isMakeup && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      make-up for {d.makeupForDate}
                    </span>
                  )}
                </TableCell>
                <TableCell><DeliveryStatusBadge status={d.status} /></TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {d.address.fullName} · {d.address.addressLine}, {d.address.city} {d.address.postalCode}
                </TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex items-center gap-2">
                    {locked ? (
                      <span className="text-muted-foreground text-xs" title="Past cutoff — locked">locked</span>
                    ) : (
                      <>
                        {/* Make-ups are terminal: no skip/pause controls, address can still change. */}
                        {!d.isMakeup && d.status === "scheduled" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => run(() => skipDeliveryAction(orderId, d.publicId))}
                          >
                            Skip
                          </Button>
                        )}
                        {!d.isMakeup && d.status === "skipped" && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending}
                            onClick={() => run(() => unskipDeliveryAction(orderId, d.publicId))}
                          >
                            Un-skip
                          </Button>
                        )}
                        {d.status === "scheduled" && (
                          <EditAddressDialog
                            orderId={orderId}
                            deliveryPublicId={d.publicId}
                            address={d.address}
                            disabled={pending}
                          />
                        )}
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

// Exact loading twin: named export, not DeliveriesPanel.Skeleton — the server page renders this
// fallback and cannot dot into this "use client" module.
export function DeliveriesPanelSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
