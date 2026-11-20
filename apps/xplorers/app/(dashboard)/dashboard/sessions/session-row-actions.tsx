"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { EyeIcon, Trash2Icon } from "lucide-react";
import { RowActionButton, RowActions } from "@foundry/design-system";
import { ConfirmDialog } from "@/components/ds";
import { unscheduleSessionAction } from "./session-actions";

export function SessionRowActions({
  publicId,
  canWrite,
  showView = true,
}: {
  publicId: string;
  canWrite: boolean;
  showView?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [removeOpen, setRemoveOpen] = useState(false);

  return (
    <RowActions>
      {showView ? <RowActionButton icon={EyeIcon} label="View session" href={`/dashboard/sessions/${publicId}`} /> : null}
      {canWrite ? (
        <>
          <RowActionButton icon={Trash2Icon} label="Remove session" onClick={() => setRemoveOpen(true)} />
          <ConfirmDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            title="Remove this session from the calendar?"
            confirmLabel={pending ? "Removing…" : "Remove session"}
            pending={pending}
            onConfirm={() =>
              startTransition(async () => {
                const result = await unscheduleSessionAction(publicId);
                if (result?.error) toast.error(result.error);
                setRemoveOpen(false);
              })
            }
          />
        </>
      ) : null}
    </RowActions>
  );
}
