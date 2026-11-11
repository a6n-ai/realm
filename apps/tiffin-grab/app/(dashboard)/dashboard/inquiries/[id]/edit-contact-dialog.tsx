"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, PencilIcon } from "lucide-react";
import { formatPhone } from "@foundry/commons";
import { Button } from "@foundry/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@foundry/ui/dialog";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { unwrapAction } from "@/lib/actions/unwrap";
import { isQuickAdd } from "@/lib/inquiries/quick-add";
import { updateInquiryContact } from "../actions";

type Contact = { fullName: string | null; phone: string | null; whatsappPhone: string | null; email: string | null; leadNumber: number | null };

/** Name, phone, WhatsApp and email. Replacing a generated "Lead <n>" name takes the lead out of Quick adds. */
export function EditContactDialog({ inquiryId, contact, trigger }: { inquiryId: string; contact: Contact; trigger?: ReactNode }) {
  const router = useRouter();
  const quick = isQuickAdd(contact);
  const initial = () => ({
    // A quick add opens with an empty name so the rep types the real one, not edits "Lead 12".
    fullName: quick ? "" : contact.fullName ?? "",
    phone: contact.phone ? formatPhone(contact.phone) : "",
    whatsappPhone: contact.whatsappPhone ? formatPhone(contact.whatsappPhone) : "",
    email: contact.email ?? "",
  });
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setValues(initial());
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await unwrapAction(updateInquiryContact(inquiryId, values));
      toast.success("Contact updated");
      router.refresh();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update contact");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof values, label: string, props: React.ComponentProps<typeof Input> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`contact-${key}`}>{label}</Label>
      <Input
        id={`contact-${key}`}
        autoComplete="off"
        value={values[key]}
        onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
        {...props}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <PencilIcon className="size-4" />
            Edit lead
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit contact</DialogTitle>
          <DialogDescription>
            {quick ? `Add their real name to replace ${contact.fullName}.` : "A name or phone number is required."}
          </DialogDescription>
        </DialogHeader>
        <form
          id="edit-contact-form"
          className="flex flex-col gap-4"
          onSubmit={(e) => { e.preventDefault(); void save(); }}
        >
          {field("fullName", "Name", { autoFocus: true, placeholder: quick ? contact.fullName ?? "" : "e.g. Priya Sharma" })}
          {field("phone", "Phone", { type: "tel", inputMode: "tel" })}
          {field("whatsappPhone", "WhatsApp (if different)", { type: "tel", inputMode: "tel", placeholder: "Same as phone" })}
          {field("email", "Email", { type: "email", inputMode: "email" })}
          {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="edit-contact-form" disabled={busy}>
            {busy && <Loader2Icon className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
