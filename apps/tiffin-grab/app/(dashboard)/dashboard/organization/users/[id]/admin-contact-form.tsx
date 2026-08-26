"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { adminUpdateContact } from "../actions";

export function AdminContactForm({ userId, email, phone }: { userId: string; email: string; phone: string }) {
  const [value, setValue] = useState({ email, phone });
  const [pending, start] = useTransition();
  const dirty = value.email !== email || value.phone !== phone;

  return (
    <div className="grid max-w-md gap-3">
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">Email</span>
        <Input type="email" value={value.email} onChange={(e) => setValue((v) => ({ ...v, email: e.target.value }))} />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-muted-foreground">Phone</span>
        <Input value={value.phone} onChange={(e) => setValue((v) => ({ ...v, phone: e.target.value }))} />
      </label>
      <Button
        className="w-full min-w-32 sm:w-auto"
        disabled={!dirty || pending}
        onClick={() =>
          start(async () => {
            try {
              await adminUpdateContact(userId, { email: value.email, phone: value.phone });
              toast.success("Contact updated.");
            } catch {
              toast.error("Could not update — check the email/phone are valid and free.");
            }
          })
        }
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "Save contact"}
      </Button>
    </div>
  );
}
