"use client";

import { useTransition } from "react";
import { ArchiveIcon, EyeIcon, EyeOffIcon, PencilIcon } from "lucide-react";
import { RowActionButton, RowActions } from "@foundry/design-system";
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
            onClick={() => {
              if (pending) return;
              if (!window.confirm("Archive this class? Its sessions leave the public calendar.")) return;
              startTransition(() => {
                void archiveClassAction(publicId);
              });
            }}
          />
        </>
      ) : null}
    </RowActions>
  );
}
