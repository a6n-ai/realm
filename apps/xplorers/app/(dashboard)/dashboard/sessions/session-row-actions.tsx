"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { EyeIcon, Trash2Icon } from "lucide-react";
import { RowActionButton, RowActions } from "@foundry/design-system";
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

  return (
    <RowActions>
      {showView ? <RowActionButton icon={EyeIcon} label="View session" href={`/dashboard/sessions/${publicId}`} /> : null}
      {canWrite ? (
        <RowActionButton
          icon={Trash2Icon}
          label="Remove session"
          onClick={() => {
            if (pending) return;
            if (!window.confirm("Remove this session from the calendar?")) return;
            startTransition(() => {
              void unscheduleSessionAction(publicId).then((result) => {
                if (result?.error) toast.error(result.error);
              });
            });
          }}
        />
      ) : null}
    </RowActions>
  );
}
