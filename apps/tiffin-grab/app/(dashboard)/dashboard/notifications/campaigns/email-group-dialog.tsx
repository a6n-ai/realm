"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UsersIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Label } from "@foundry/ui/label";
import { ResponsiveDialog } from "@/components/ds";
import { Alert, AlertDescription } from "@/components/reui/alert";
import { GroupPicker, type PickedGroup } from "../../customer-groups/group-picker";
import { emailGroupAction } from "../../customer-groups/actions";

export function EmailGroupDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState<PickedGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setGroup(null);
      setError(null);
    }
  };

  async function create() {
    if (!group || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await emailGroupAction(group.publicId);
      if (res.ok) {
        router.push(`/dashboard/notifications/campaigns/${res.data.campaignPublicId}?step=content`);
        return;
      }
      setError(res.error);
    } catch {
      setError("The request did not finish.");
    }
    setBusy(false);
  }

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UsersIcon /> Email a customer group
      </Button>
      <ResponsiveDialog
        open={open}
        onOpenChange={reset}
        title="Email a customer group"
        description="Creates an email campaign to the group's current members who have email on. You write the message next."
      >
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email-group">Customer group</Label>
            <GroupPicker id="email-group" value={group} onChange={setGroup} />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => reset(false)} disabled={busy}>Cancel</Button>
            <Button type="button" onClick={() => void create()} disabled={!group || busy}>
              {busy ? "Creating campaign..." : "Create campaign"}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
