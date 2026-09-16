"use client";

import { useTransition } from "react";
import { Switch } from "@foundry/ui/switch";
import { setSessionPublished } from "./session-actions";

export function PublishToggle({ publicId, published }: { publicId: string; published: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={published}
      disabled={pending}
      aria-label={published ? "Unpublish session" : "Publish session"}
      onCheckedChange={(next) => {
        startTransition(() => {
          void setSessionPublished(publicId, next);
        });
      }}
    />
  );
}
