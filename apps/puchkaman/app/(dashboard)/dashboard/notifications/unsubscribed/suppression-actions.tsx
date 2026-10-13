"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheckIcon } from "lucide-react";
import { toast } from "sonner";
import { ResponsiveDialog, RowActionButton } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { clearSuppressionAction, suppressManuallyAction } from "./actions";

/** Remove a bounce, complaint or manual block. Never offered for an unsubscribe. */
export function ClearSuppressionButton({ publicId, address }: { publicId: string; address: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const clear = () =>
    start(async () => {
      const r = await clearSuppressionAction(publicId);
      if (r.error) return void toast.error(r.error);
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
        description={`Messages can be sent to ${address} again. If it bounces or they complain again, it will be blocked again.`}
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
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [pending, start] = useTransition();
  const add = () =>
    start(async () => {
      const r = await suppressManuallyAction(address, channel);
      if (r.error) return void toast.error(r.error);
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
          <div className="flex gap-2">
            {(["email", "sms"] as const).map((c) => (
              <Button key={c} type="button" size="sm" variant={channel === c ? "secondary" : "ghost"} onClick={() => setChannel(c)}>
                {c === "email" ? "Email" : "SMS"}
              </Button>
            ))}
          </div>
          <Input
            aria-label={channel === "email" ? "Email address" : "Phone number"}
            type={channel === "email" ? "email" : "tel"}
            placeholder={channel === "email" ? "name@example.com" : "+1 416 555 0100"}
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
