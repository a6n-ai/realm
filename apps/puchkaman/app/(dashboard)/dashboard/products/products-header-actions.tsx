"use client";

import { useState } from "react";
import { PlusIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { CloverInventorySyncDialog } from "@/components/admin/clover-inventory-sync-dialog";
import { DeleteAllProductsDialog } from "@/components/admin/delete-all-products-dialog";
import { SyncDialog } from "@/components/admin/sync-dialog";
import { ProductForm } from "./product-form";

/** PageHeader actions — same slot as tiffin-grab orders/inquiries "New …". */
export function ProductsHeaderActions({
  cloverEnabled,
  cloverConnected,
  granted,
}: {
  /** Plugin installed — gates Sync Clover chrome. */
  cloverEnabled: boolean;
  cloverConnected: boolean;
  /** Server-computed "resource:action" keys — see lib/auth/nav-permissions.ts. */
  granted: string[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [cloverSyncOpen, setCloverSyncOpen] = useState(false);
  // TEMPORARY: one-time catalogue wipe before the Clover rebuild — remove with
  // DeleteAllProductsDialog and /api/products/delete-all.
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const canWrite = granted.includes("product:write");
  const canSync = granted.includes("product:sync");

  return (
    <>
      {canSync ? (
        <Button type="button" variant="outline" className="gap-1.5" onClick={() => setSyncOpen(true)}>
          <RefreshCwIcon className="size-4" />
          Sync images (Uber)
        </Button>
      ) : null}
      {cloverEnabled && canSync ? (
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
      {canWrite ? (
        <Button
          type="button"
          variant="outline"
          className="text-destructive hover:text-destructive gap-1.5"
          onClick={() => setDeleteAllOpen(true)}
        >
          <Trash2Icon className="size-4" />
          Delete all
        </Button>
      ) : null}
      {canWrite ? (
        <Button type="button" className="gap-1.5" onClick={() => setFormOpen(true)}>
          <PlusIcon className="size-4" />
          Add product
        </Button>
      ) : null}
      <ProductForm open={formOpen} onOpenChange={setFormOpen} product={null} canWrite={canWrite} />
      <SyncDialog open={syncOpen} cloverConnected={cloverConnected} onOpenChange={setSyncOpen} />
      <DeleteAllProductsDialog open={deleteAllOpen} onOpenChange={setDeleteAllOpen} />
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
