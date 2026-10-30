"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { adminUpdateContact } from "@/app/(dashboard)/dashboard/organization/members/actions";

// Admin edit of any account's email/phone (staff on the member page, customers
// on the customer page). A changed email comes back unverified — see
// usersService.updateContact.
export function AdminContactForm({ userId, email, phone }: { userId: string; email: string; phone: string }) {
  const [value, setValue] = useState({ email, phone });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = value.email !== email || value.phone !== phone;
  // Emptying the field is not how a phone is removed; the Remove button is.
  const phoneEmptied = phone !== "" && value.phone.trim() === "";

  const save = (removePhone: boolean) =>
    start(async () => {
      try {
        const res = await adminUpdateContact(userId, { email: value.email, phone: value.phone }, { removePhone });
        if (res.error) {
          const href = res.holderHref;
          return void toast.error(res.error, href ? { action: { label: "Open account", onClick: () => router.push(href) } } : undefined);
        }
        if (removePhone) {
          setValue((v) => ({ ...v, phone: "" }));
          return void toast.success("Phone removed.");
        }
        toast.success(value.email !== email ? "Contact updated. The new email needs verifying at next sign-in." : "Contact updated.");
      } catch {
        toast.error("Could not update — check the email/phone are valid and free.");
      } finally {
        setConfirmRemove(false);
      }
    });

  return (
    <div className="grid max-w-md gap-3">
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">Email</span>
        <Input type="email" value={value.email} onChange={(e) => setValue((v) => ({ ...v, email: e.target.value }))} />
      </label>
      <div className="grid gap-1.5 text-sm">
        <label htmlFor={`phone-${userId}`} className="text-muted-foreground">
          Phone
        </label>
        <div className="flex gap-2">
          <Input id={`phone-${userId}`} value={value.phone} onChange={(e) => setValue((v) => ({ ...v, phone: e.target.value }))} />
          {phone !== "" && (
            <Button
              variant={confirmRemove ? "destructive" : "outline"}
              disabled={pending}
              onClick={() => (confirmRemove ? save(true) : setConfirmRemove(true))}
              onBlur={() => setConfirmRemove(false)}
            >
              {confirmRemove ? "Confirm remove" : "Remove"}
            </Button>
          )}
        </div>
        {phoneEmptied && <span className="text-xs text-muted-foreground">To clear the phone, use Remove.</span>}
      </div>
      <Button
        className="w-full min-w-32 sm:w-auto"
        disabled={!dirty || phoneEmptied || pending}
        onClick={() => save(false)}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Save contact"}
      </Button>
    </div>
  );
}
