"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ResponsiveDialog } from "@foundry/design-system";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import type { ContactListMemberRow } from "@relay/engine";
import { convertContactToCustomer, getContactListMembers } from "./actions";

function MemberRow({ listPublicId, member }: { listPublicId: string; member: ContactListMemberRow }) {
  const missing = !member.email ? "email" : !member.phone ? "phone" : null;
  const [value, setValue] = useState("");
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState(false);

  async function convert() {
    if (missing && !value.trim()) return toast.error(`Enter a ${missing} to create an account`);
    setConverting(true);
    try {
      const res = await convertContactToCustomer({
        listPublicId,
        memberPublicId: member.publicId,
        email: missing === "email" ? value : undefined,
        phone: missing === "phone" ? value : undefined,
      });
      toast.success(res.alreadyExisted ? "Already a customer" : "Customer account created");
      setDone(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create the account");
    } finally {
      setConverting(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{member.name ?? "—"}</p>
        <p className="text-xs text-muted-foreground">{member.email ?? member.phone ?? "no contact info"}</p>
      </div>
      <div className="flex items-center gap-2">
        {missing && !done && (
          <Input
            placeholder={missing === "email" ? "Email" : "Phone"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="h-8 w-40"
          />
        )}
        <Button size="sm" variant="outline" disabled={converting || done} onClick={convert}>
          {done ? "Converted" : converting ? "Converting…" : "Convert to customer"}
        </Button>
      </div>
    </li>
  );
}

export function ContactListMembersDialog({ listPublicId, listName }: { listPublicId: string; listName: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ContactListMemberRow[] | null>(null);

  async function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !members) {
      try {
        setMembers(await getContactListMembers(listPublicId));
      } catch {
        toast.error("Couldn't load contacts");
        setOpen(false);
      }
    }
  }

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={listName}
      description="Convert a contact into a full customer account. A contact imported with only an email or only a phone needs the other one supplied here."
      trigger={
        <Button size="sm" variant="ghost">
          View contacts
        </Button>
      }
    >
      <div className="p-4">
        {!members ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No contacts.</p>
        ) : (
          <ul className="divide-y">
            {members.map((m) => (
              <MemberRow key={m.publicId} listPublicId={listPublicId} member={m} />
            ))}
          </ul>
        )}
      </div>
    </ResponsiveDialog>
  );
}
