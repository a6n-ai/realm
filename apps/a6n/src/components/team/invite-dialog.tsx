import { CreateDialog } from "@foundry/console/create-dialog";
import { FormError } from "@foundry/console/form-error";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";
import { SettingsCard } from "../page/settings-card";
import { errorText } from "../../lib/error-copy";
import { inviteFn } from "../../lib/team/team.fns";

export async function copyLink(link: string) {
  try {
    await navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  } catch {
    toast.error("Could not copy. Select the link and copy it by hand.");
  }
}

type Result = { sent: boolean; inviteLink: string; email: string; reason?: string };

// `inline` renders the form as the members page card: fields in one row, Invite in the card footer.
export function InviteForm({ done, inline = false }: { done: () => void; inline?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const formId = useId();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await inviteFn({ data: { email, name } });
      if (!res.ok) return setError(errorText(new Error(res.code)));
      setResult({ sent: res.sent, inviteLink: res.inviteLink, email: email.trim().toLowerCase(), reason: res.reason });
      await router.invalidate();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  if (result) {
    const finished = (
      <div className="grid gap-4">
        <p className="text-sm" role="status">
          {result.sent
            ? `Invite sent to ${result.email}.`
            : `The invite to ${result.email} could not be sent. ${result.reason ? `${errorText(new Error(result.reason))} ` : ""}Copy the link and send it another way.`}
        </p>
        {result.sent ? null : (
          <Input readOnly value={result.inviteLink} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
        )}
        <div className="flex gap-2">
          {result.sent ? null : <Button onClick={() => void copyLink(result.inviteLink)}>Copy link</Button>}
          <Button variant="outline" onClick={done}>
            Done
          </Button>
        </div>
      </div>
    );
    return inline ? <SettingsCard title="Invite Team Members">{finished}</SettingsCard> : finished;
  }

  const form = (
    <form id={formId} onSubmit={submit} className={inline ? "grid gap-3 sm:grid-cols-2" : "grid gap-4"}>
      <div className="grid gap-2">
        <Label htmlFor="inv-email">Email</Label>
        <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="inv-name">Name</Label>
        <Input id="inv-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {inline ? null : <Button type="submit" disabled={pending}>Send invite</Button>}
      <div className={inline ? "sm:col-span-2" : undefined}>
        <FormError error={error} />
      </div>
    </form>
  );
  if (!inline) return form;
  return (
    <SettingsCard
      title="Invite Team Members"
      description="They get an email to set a password."
      footer="New members join as sales."
      action={
        <Button type="submit" form={formId} disabled={pending}>
          Invite
        </Button>
      }
    >
      {form}
    </SettingsCard>
  );
}

export function InviteDialog({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <CreateDialog trigger={open === undefined ? "Invite" : undefined} open={open} onOpenChange={onOpenChange} title="Invite a team member">
      {(done) => <InviteForm done={done} />}
    </CreateDialog>
  );
}
