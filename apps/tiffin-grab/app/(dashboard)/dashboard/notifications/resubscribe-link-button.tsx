"use client";

import { useTransition } from "react";
import { LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { RowActionButton } from "@/components/ds";
import { resubscribeLink } from "./actions";

export function ResubscribeLinkButton({ address }: { address: string }) {
  const [pending, start] = useTransition();
  return (
    <RowActionButton
      icon={LinkIcon}
      label="Copy re-subscribe link"
      onClick={() => {
        if (pending) return;
        start(async () => {
          const r = await resubscribeLink(address);
          if ("error" in r) return void toast.error(r.error);
          try {
            await navigator.clipboard.writeText(r.url);
            toast.success("Re-subscribe link copied", { description: `Send it to ${address}. They confirm with one click.` });
          } catch {
            // Clipboard can refuse after the await (lost user gesture) — show it to copy by hand.
            toast("Re-subscribe link", { description: r.url, duration: 30_000 });
          }
        });
      }}
    />
  );
}
