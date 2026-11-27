"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheckIcon } from "lucide-react";
import { toast } from "@foundry/ui/toast";
import { ResponsiveDialog, RowActionButton } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { clearSuppressionAction, suppressManuallyAction } from "./actions";

/** Remove a bounce or manual block. Never offered for a complaint or an unsubscribe. */
export function ClearSuppressionButton({ publicId, address, reason }: { publicId: string; address: string; reason: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const clear = () =>
    start(async () => {
      const r = await clearSuppressionAction(publicId, address, reason);
      if ("error" in r) return void toast.error(r.error);
      toast.success("Block cleared");
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <RowActionButton icon={ShieldCheckIcon} label="Clear block" onClick={() => setOpen(true)} />
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Clear this block?"
        description={`Remove a bounce or manual block. Messages can be sent to ${address} again. If it bounces, it will be blocked again.`}
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={clear} disabled={pending}>
            {pending ? "Clearing…" : "Clear block"}
          </Button>
        </div>
      </ResponsiveDialog>
    </>
  );
}

export function ManualSuppress() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [pending, start] = useTransition();
  const add = () =>
    start(async () => {
      const r = await suppressManuallyAction(address);
      if ("error" in r) return void toast.error(r.error);
      toast.success("Added — marketing to this address is blocked");
      setAddress("");
      setOpen(false);
      router.refresh();
    });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Add manually
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={setOpen}
        title="Stop marketing to an address"
        description="Use this when someone asks by phone or in person to stop marketing messages."
      >
        <div className="space-y-4 pt-2">
          <Input
            aria-label="Email address"
            type="email"
            placeholder="name@example.com"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={add} disabled={pending || !address.trim()}>
              {pending ? "Adding…" : "Add"}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
