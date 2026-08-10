"use client";

import { useState, useTransition } from "react";
import { UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@realm/ui/dialog";
import { Input } from "@realm/ui/input";
import { Label } from "@realm/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@realm/ui/select";

export type InviteRoleOption = { value: string; label: string };
export type InviteUserInput = { email: string; name: string; role: string };

export type UserInviteDialogProps = {
  roles: InviteRoleOption[];
  onInvite: (input: InviteUserInput) => Promise<void>;
  triggerLabel?: string;
};

/**
 * Invite a staff account. No password field by design — the invitee receives a code
 * and sets their own, so nothing is ever shared out of band.
 */
export function UserInviteDialog({ roles, onInvite, triggerLabel = "Invite user" }: UserInviteDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState(roles[0]?.value ?? "");
  const [pending, start] = useTransition();

  function submit() {
    start(async () => {
      try {
        await onInvite({ email, name, role });
        toast.success(`Invite sent to ${email.trim()}.`);
        setOpen(false);
        setEmail("");
        setName("");
        setRole(roles[0]?.value ?? "");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not send the invite.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlusIcon className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite user</DialogTitle>
          <DialogDescription>
            They receive a code by email and choose their own password. No password is set here.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invite-name">Name</Label>
            <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || email.trim() === "" || name.trim() === ""}>
            {pending ? "Sending…" : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
