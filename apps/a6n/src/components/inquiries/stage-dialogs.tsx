import { ConfirmDialog } from "@foundry/console/confirm-dialog";
import { confirmAction } from "@foundry/console/run-action";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { errorText } from "../../lib/error-copy";
import { changeStageFn } from "../../lib/inquiries/inquiries.fns";
import type { Stage } from "../../lib/inquiries/stages";
import { ResponsiveDialog } from "../responsive-dialog";
import { LostForm } from "./lost-form";
import { ReopenForm } from "./reopen-form";

export type StageDialog = "lost" | "won" | "reopen" | null;

// Portals to <body>: inside a table cell, ResourceTable's row rules (`td button`: relative) would break their close button.
export function StageDialogs({ id, stage, dialog, close }: { id: string; stage: Stage; dialog: StageDialog; close: () => void }) {
  const router = useRouter();
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  const dialogs = (
    <>
      <ResponsiveDialog open={dialog === "lost"} onOpenChange={(o) => !o && close()} title="Mark as lost" description="Why was this inquiry lost?">
        <LostForm id={id} from={stage} done={close} />
      </ResponsiveDialog>
      <ResponsiveDialog open={dialog === "reopen"} onOpenChange={(o) => !o && close()} title="Reopen inquiry">
        <ReopenForm id={id} done={close} />
      </ResponsiveDialog>
      <ConfirmDialog
        open={dialog === "won"}
        onOpenChange={(o) => !o && close()}
        title="Mark as won?"
        description="The inquiry closes as won. You can reopen it later."
        confirmLabel="Mark as won"
        destructive={false}
        onConfirm={async () => {
          await confirmAction(() => changeStageFn({ data: { id, from: stage, to: "won", lostReason: null } }), "Moved to Won", () => router.invalidate(), errorText);
          close();
        }}
      />
    </>
  );
  return host ? createPortal(dialogs, host) : null;
}
