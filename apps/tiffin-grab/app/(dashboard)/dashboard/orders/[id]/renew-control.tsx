"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { ResponsiveDialog } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { QuickRenewForm } from "@/components/renew/quick-renew-form";
import type { QuickRenewData } from "@/components/renew/types";
import { AdminOrderCreatedDialog, type AdminOrderCreated } from "../admin-order-created-dialog";
import { loadRenewAction, renewOrderAction } from "./renew-actions";

type Load = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; data: QuickRenewData | null };

/** Admin: renew this customer's plan in one sheet. Creates the order only; payment happens on the pay link or via proof. */
export function RenewControl({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [created, setCreated] = useState<AdminOrderCreated | null>(null);

  const fetchData = async () => {
    setLoad({ state: "loading" });
    try {
      const res = await loadRenewAction(orderId);
      setLoad("error" in res ? { state: "error", message: res.error } : { state: "ready", data: res.data });
    } catch {
      setLoad({ state: "error", message: "Couldn't load the renewal. Try again." });
    }
  };

  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o) void fetchData();
        }}
        trigger={<Button size="sm" variant="outline">Renew</Button>}
        title="Renew plan"
        description="Creates the next plan for this customer. They pay on the payment link, or you attach their e-Transfer after."
        contentClassName="sm:max-w-xl"
      >
        {load.state === "loading" ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : load.state === "error" ? (
          <Alert variant="destructive">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              {load.message}
              <Button size="sm" variant="outline" onClick={() => void fetchData()}>Retry</Button>
            </AlertDescription>
          </Alert>
        ) : load.data == null ? (
          <p className="text-muted-foreground text-sm">This plan can&apos;t be quick-renewed. Use New order.</p>
        ) : (
          <QuickRenewForm
            {...load.data}
            variant="admin"
            submitLabel="Create renewal"
            onSubmit={async (selections, addressPublicId) => {
              try {
                const res = await renewOrderAction({ orderPublicId: orderId, selections, addressPublicId });
                if ("error" in res) return res.error;
                const { ok: _ok, message: _m, ...result } = res;
                setOpen(false);
                setCreated(result);
                router.refresh();
                return null;
              } catch {
                return "Couldn't create the renewal. Try again.";
              }
            }}
          />
        )}
      </ResponsiveDialog>
      <AdminOrderCreatedDialog open={created != null} onOpenChange={(o) => !o && setCreated(null)} result={created} />
    </>
  );
}
