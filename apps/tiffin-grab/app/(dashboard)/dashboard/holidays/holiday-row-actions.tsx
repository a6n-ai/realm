"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { PencilIcon, RotateCwIcon, Trash2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { ResponsiveDialog, RowActionTooltipButton } from "@/components/ds";
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
    <div className="flex justify-end gap-1">
      {canReapply && <RowActionTooltipButton icon={RotateCwIcon} label="Re-apply" hint="Re-apply: close any delivery this holiday missed" disabled={pending} onClick={reapply} />}
      <RowActionTooltipButton icon={PencilIcon} label="Rename" onClick={() => { setName(current); setError(null); setRenameOpen(true); }} />
      {canRemove && <RowActionTooltipButton icon={Trash2Icon} label="Remove" tone="text-destructive" onClick={() => { setError(null); setRemoveOpen(true); }} />}
      <ResponsiveDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
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
          onOpenChange={setRemoveOpen}
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
