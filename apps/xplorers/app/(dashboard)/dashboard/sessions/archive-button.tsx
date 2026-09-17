"use client";

import { useTransition } from "react";
import { Button } from "@foundry/ui/button";
import { archiveSessionAction } from "./session-actions";

export function ArchiveSessionButton({ publicId }: { publicId: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!window.confirm("Archive this session? It will leave the public calendar.")) return;
        startTransition(() => {
          void archiveSessionAction(publicId);
        });
      }}
    >
      {pending ? "Archiving…" : "Archive"}
    </Button>
  );
}
