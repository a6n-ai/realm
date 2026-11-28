import { CreateDialog } from "@foundry/console/create-dialog";
import { FormError } from "@foundry/console/form-error";
import { confirmAction } from "@foundry/console/run-action";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { PhoneInput } from "@foundry/ui/phone-input";
import { Textarea } from "@foundry/ui/textarea";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { errorText } from "../../lib/error-copy";
import { updateContactFn } from "../../lib/inquiries/inquiries.fns";
import { DEFAULT_COUNTRY, toInputValue } from "../../lib/phone";

type Contact = { id: string; contactName: string | null; phone: string | null; email: string | null; requirements: string | null };

function Form({ contact, done }: { contact: Contact; done: () => void }) {
  const router = useRouter();
  const [contactName, setName] = useState(contact.contactName ?? "");
  const [phone, setPhone] = useState(() => toInputValue(contact.phone));
  const [email, setEmail] = useState(contact.email ?? "");
  const [requirements, setRequirements] = useState(contact.requirements ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!contactName.trim() && !phone.trim()) return setError("Keep a contact name or a phone number.");
    setError(null);
    setPending(true);
    try {
      await confirmAction(() => updateContactFn({ data: { id: contact.id, contactName, phone, email, requirements } }), "Contact updated", () => router.invalidate(), errorText);
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="ec-name">Contact name</Label>
        <Input id="ec-name" value={contactName} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ec-phone">Phone</Label>
        <PhoneInput id="ec-phone" defaultCountry={DEFAULT_COUNTRY} value={phone} onChange={setPhone} />
        {contact.phone && !phone ? <p className="text-xs text-muted-foreground">Stored as "{contact.phone}", which is not a full number. Enter it again to replace it.</p> : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ec-email">Email</Label>
        <Input id="ec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="ec-req">Requirements</Label>
        <Textarea id="ec-req" rows={4} value={requirements} onChange={(e) => setRequirements(e.target.value)} />
      </div>
      <FormError error={error} />
      <Button type="submit" disabled={pending}>
        Save contact
      </Button>
    </form>
  );
}

// Pass open/onOpenChange to drive it from a menu or button; without them it renders its own trigger.
export function EditContactDialog({ contact, open, onOpenChange }: { contact: Contact; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  return (
    <CreateDialog trigger={open === undefined ? "Edit contact" : undefined} open={open} onOpenChange={onOpenChange} title="Edit contact">
      {(done) => <Form contact={contact} done={done} />}
    </CreateDialog>
  );
}
