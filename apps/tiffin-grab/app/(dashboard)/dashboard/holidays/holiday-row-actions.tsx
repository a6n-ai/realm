"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { ResponsiveDialog } from "@/components/ds";
import { reapplyHolidayAction, removeHolidayAction, renameHolidayAction } from "./actions";

export function HolidayRowActions({ publicId, name: current, canReapply, canRemove }: { publicId: string; name: string; canReapply: boolean; canRemove: boolean }) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const rename = () =>
    start(async () => {
      setError(null);
      const res = await renameHolidayAction(publicId, name);
      if ("error" in res) return setError(res.error);
      setRenameOpen(false);
      toast.success(res.message);
      router.refresh();
    });
  const remove = () =>
    start(async () => {
      setError(null);
      const res = await removeHolidayAction(publicId);
      if ("error" in res) return setError(res.error);
      setRemoveOpen(false);
      // A kept holiday is not a success: the row and its Remove button stay so staff can run it again.
      (res.removed ? toast.success : toast.warning)(res.message);
      router.refresh();
    });
  const reapply = () =>
    start(async () => {
      const res = await reapplyHolidayAction(publicId);
      if ("error" in res) return void toast.error(res.error);
      toast.success(res.message);
      router.refresh();
    });

  return (
    <div className="flex justify-end gap-2">
      {canReapply && <Button size="sm" variant="outline" disabled={pending} onClick={reapply}>Re-apply</Button>}
      <ResponsiveDialog
        open={renameOpen}
        onOpenChange={(o) => { setRenameOpen(o); if (o) { setName(current); setError(null); } }}
        trigger={<Button size="sm" variant="outline">Rename</Button>}
        title="Rename holiday"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button disabled={pending || !name.trim()} onClick={rename}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="grid gap-2">
          <Label htmlFor={`hol-rename-${publicId}`}>Name</Label>
          <Input id={`hol-rename-${publicId}`} maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        </div>
      </ResponsiveDialog>
      {canRemove && (
        <ResponsiveDialog
          open={removeOpen}
          onOpenChange={(o) => { setRemoveOpen(o); if (o) setError(null); }}
          trigger={<Button size="sm" variant="outline">Remove</Button>}
          title="Remove this holiday?"
          description="Deliveries go back to that day where the extra day is untouched. A customer who already changed their extra day keeps it. Customers who were told about the holiday are told it is off."
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button>
              <Button variant="destructive" disabled={pending} onClick={remove}>{pending ? "Removing…" : "Remove holiday"}</Button>
            </div>
          }
        >
          {error && <p role="alert" className="text-destructive text-sm">{error}</p>}
        </ResponsiveDialog>
      )}
    </div>
  );
}
