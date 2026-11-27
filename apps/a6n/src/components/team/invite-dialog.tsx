import { CreateDialog } from "@foundry/console/create-dialog";
import { FormError } from "@foundry/console/form-error";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
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

type Result = { sent: boolean; inviteLink: string; email: string };

// `inline` lays the fields in one row, for the card at the top of the members page.
export function InviteForm({ done, inline = false }: { done: () => void; inline?: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await inviteFn({ data: { email, name } });
      if (!res.ok) return setError(errorText(new Error(res.code)));
      setResult({ sent: res.sent, inviteLink: res.inviteLink, email: email.trim().toLowerCase() });
      await router.invalidate();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="grid gap-4">
        <p className="text-sm" role="status">
          {result.sent ? `Invite sent to ${result.email}.` : `The invite to ${result.email} could not be sent. Copy the link and send it another way.`}
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
  }

  return (
    <form onSubmit={submit} className={inline ? "grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start" : "grid gap-4"}>
      <div className="grid gap-2">
        <Label htmlFor="inv-email">Email</Label>
        <Input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="inv-name">Name</Label>
        <Input id="inv-name" required value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button type="submit" disabled={pending} className={inline ? "sm:mt-[1.625rem]" : undefined}>
        {inline ? "Invite" : "Send invite"}
      </Button>
      <div className={inline ? "sm:col-span-3" : undefined}>
        <FormError error={error} />
      </div>
    </form>
  );
}

export function InviteDialog({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <CreateDialog trigger={open === undefined ? "Invite" : undefined} open={open} onOpenChange={onOpenChange} title="Invite a team member">
      {(done) => <InviteForm done={done} />}
    </CreateDialog>
  );
}
