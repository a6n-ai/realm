"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@foundry/ui/button";
import { createDraftCampaign } from "./actions";
import type { PickedGroup } from "../../customer-groups/group-picker";
import { EmailGroupDialog } from "./email-group-dialog";

function Buttons() {
  // Disabled while the draft is being created, so a double click cannot make two.
  const { pending } = useFormStatus();
  return (
    <>
      <Button type="submit" name="channel" value="sms" size="sm" variant="outline" disabled={pending}>
        New SMS
      </Button>
      <Button type="submit" name="channel" value="whatsapp" size="sm" variant="outline" disabled={pending}>
        New WhatsApp
      </Button>
      <Button type="submit" name="channel" value="email" size="sm" disabled={pending}>
        {pending ? "Creating…" : "New campaign"}
      </Button>
    </>
  );
}

/** A form post, not a link: a GET must never create a draft. */
export function NewCampaignButtons({ presetGroup = null, groupMissing = false }: { presetGroup?: PickedGroup | null; groupMissing?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <EmailGroupDialog presetGroup={presetGroup} groupMissing={groupMissing} />
      <form action={createDraftCampaign} className="flex items-center gap-2">
        <Buttons />
      </form>
    </div>
  );
}
