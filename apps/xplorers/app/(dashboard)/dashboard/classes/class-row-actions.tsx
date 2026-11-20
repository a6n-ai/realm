"use client";

import { useState, useTransition } from "react";
import { ArchiveIcon, EyeIcon, EyeOffIcon, PencilIcon } from "lucide-react";
import { RowActionButton, RowActions } from "@foundry/design-system";
import { ConfirmDialog } from "@/components/ds";
import { archiveClassAction, setClassPublished } from "./class-actions";

export function ClassRowActions({
  publicId,
  published,
  canWrite,
  showEdit = true,
}: {
  publicId: string;
  published: boolean;
  canWrite: boolean;
  showEdit?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [archiveOpen, setArchiveOpen] = useState(false);

  return (
    <RowActions>
      {showEdit ? (
        <RowActionButton icon={PencilIcon} label={canWrite ? "Edit class" : "View class"} href={`/dashboard/classes/${publicId}`} />
      ) : null}
      {canWrite ? (
        <>
          <RowActionButton
            icon={published ? EyeOffIcon : EyeIcon}
            label={published ? "Unpublish class" : "Publish class"}
            onClick={() => {
              startTransition(() => {
                void setClassPublished(publicId, !published);
              });
            }}
          />
          <RowActionButton
            icon={ArchiveIcon}
            label="Archive class"
            onClick={() => setArchiveOpen(true)}
          />
          <ConfirmDialog
            open={archiveOpen}
            onOpenChange={setArchiveOpen}
            title="Archive this class?"
            description="Its sessions leave the public calendar."
            confirmLabel={pending ? "Archiving…" : "Archive class"}
            pending={pending}
            onConfirm={() =>
              startTransition(async () => {
                await archiveClassAction(publicId);
                setArchiveOpen(false);
              })
            }
          />
        </>
      ) : null}
    </RowActions>
  );
}
