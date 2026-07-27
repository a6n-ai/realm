"use client";

import { useState } from "react";
import { PlusIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { CloverInventorySyncDialog } from "@/components/admin/clover-inventory-sync-dialog";
import { SyncDialog } from "@/components/admin/sync-dialog";
import { ProductForm } from "./product-form";

/** PageHeader actions — same slot as tiffin-grab orders/inquiries "New …". */
export function ProductsHeaderActions({
  cloverEnabled,
  cloverConnected,
}: {
  /** Plugin installed — gates Sync Clover chrome. */
  cloverEnabled: boolean;
  cloverConnected: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [cloverSyncOpen, setCloverSyncOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" className="gap-1.5" onClick={() => setSyncOpen(true)}>
        <RefreshCwIcon className="size-4" />
        Sync images (Uber)
      </Button>
      {cloverEnabled ? (
        <Button
          type="button"
          variant="outline"
          className="gap-1.5"
          onClick={() => setCloverSyncOpen(true)}
        >
          <RefreshCwIcon className="size-4" />
          Sync Clover
        </Button>
      ) : null}
      <Button type="button" className="gap-1.5" onClick={() => setFormOpen(true)}>
        <PlusIcon className="size-4" />
        Add product
      </Button>
      <ProductForm open={formOpen} onOpenChange={setFormOpen} product={null} />
      <SyncDialog open={syncOpen} onOpenChange={setSyncOpen} />
      {cloverEnabled ? (
        <CloverInventorySyncDialog
          open={cloverSyncOpen}
          onOpenChange={setCloverSyncOpen}
          cloverConnected={cloverConnected}
        />
      ) : null}
    </>
  );
}
