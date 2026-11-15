"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@foundry/ui/sheet";
import { OrgRoleDialog, RoleChips, chipState, type PermissionMap, type ResourceLabel } from "@foundry/crm";
import { Badge } from "@/components/reui/badge";
import { AdminContactForm } from "@/components/dashboard/admin-contact-form";
import { unwrapAction } from "@/lib/actions/unwrap";
import { addMemberAction, removeMemberAction } from "@/lib/services/organizations-actions";
import { createRole } from "../roles/actions";
import { setMemberRoles, setUserStatus } from "./actions";
import type { MemberPanelData } from "./member-panel-data";
import { StatusSelect } from "./user-row";

type Confirm = "remove" | "suspend" | null;

export function MemberSheet({ data, resources }: { data: MemberPanelData; resources: ResourceLabel[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  // Closing drops only the member param, so search and filters survive.
  const close = () => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("member");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };
  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{data.member.name || data.member.email || "Member"}</SheetTitle>
          <SheetDescription>{data.member.email ?? "No email on file"}</SheetDescription>
        </SheetHeader>
        <MemberPanelBody key={data.member.id} data={data} resources={resources} onRemoved={close} />
      </SheetContent>
    </Sheet>
  );
}

export function MemberPanelBody({
  data,
  resources,
  onRemoved,
  showContact = true,
}: {
  data: MemberPanelData;
  resources: ResourceLabel[];
  onRemoved?: () => void;
  /** The member detail page already shows the contact card. */
  showContact?: boolean;
}) {
  const router = useRouter();
  const { member, activeOrgId, access, chips, options, grantable, canCreateRole, memberships, addableOrgs } = data;
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [addOrgId, setAddOrgId] = useState("");
  const [addRole, setAddRole] = useState("");
  const label = member.name || member.email || "This person";
  const addRoles = addableOrgs.find((o) => o.id === addOrgId)?.roles ?? [];

  async function assign(roles: string[]): Promise<{ error?: string }> {
    const res = await setMemberRoles(member.memberId, roles);
    if ("error" in res) return { error: res.error };
    router.refresh();
    return {};
  }

  async function createAndAssign(input: { name: string; permission: PermissionMap }): Promise<{ error?: string }> {
    const created = await createRole(input);
    if ("error" in created) return { error: created.error };
    const assigned = await assign([...access.roles, input.name]);
    return assigned.error ? { error: `Role saved, but not assigned: ${assigned.error}` } : {};
  }

  const held = resources
    .map((r) => ({
      resource: r.resource,
      label: r.label,
      actions: r.actions.filter((a) => (access.permissions[r.resource] ?? []).includes(a.action)),
    }))
    .filter((r) => r.actions.length > 0);

  function removeFromOrg() {
    start(async () => {
      const res = await removeMemberAction(activeOrgId, member.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirm(null);
      toast.success(`${label} was removed from this organization.`);
      if (onRemoved) onRemoved();
      else router.refresh();
    });
  }

  function suspend() {
    start(async () => {
      try {
        await unwrapAction(setUserStatus(member.id, "suspended"));
        setConfirm(null);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not suspend.");
      }
    });
  }

  function addToOrg() {
    start(async () => {
      const res = await addMemberAction(addOrgId, member.id, addRole);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAddOrgId("");
      setAddRole("");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-6">
      <section className="grid gap-3" aria-label="Roles">
        <h3 className="text-sm font-medium">Roles</h3>
        <RoleChips
          key={access.roles.join(",")}
          roles={access.roles}
          options={options}
          onAdd={(role) => assign([...access.roles, role])}
          onRemove={(role) => assign(access.roles.filter((r) => r !== role))}
          disabledReason={(role, op) => chipState(role, op, chips)}
        />
        {canCreateRole && (
          <OrgRoleDialog
            resources={resources}
            grantable={grantable}
            initial={{ name: "", permission: Object.fromEntries(Object.entries(access.permissions).map(([r, acts]) => [r, (acts ?? []).filter((a) => (grantable[r] ?? []).includes(a))])) }}
            trigger={
              <Button variant="outline" size="sm" className="justify-self-start">
                Create a role from these permissions
              </Button>
            }
            onSave={createAndAssign}
          />
        )}
      </section>

      <section className="grid gap-2" aria-label="Effective permissions">
        <h3 className="text-sm font-medium">Effective permissions</h3>
        <p className="text-muted-foreground text-xs">The union of this person&apos;s roles. Read only.</p>
        {held.length === 0 ? (
          <p className="text-muted-foreground text-sm">No permissions yet. Add a role to give access.</p>
        ) : (
          <ul className="grid gap-3">
            {held.map((r) => (
              <li key={r.resource} className="grid gap-1">
                <span className="text-sm font-medium">{r.label}</span>
                <span className="flex flex-wrap gap-1">
                  {r.actions.map((a) => (
                    <Badge key={a.action} variant="secondary">{a.label}</Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2" aria-label="Organizations">
        <h3 className="text-sm font-medium">Organizations</h3>
        <ul className="grid gap-2">
          {memberships.map((m) => (
            <li key={m.organizationId} className="flex items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate">{m.name}</span>
              {m.role && <Badge variant="secondary" className="capitalize">{m.role}</Badge>}
            </li>
          ))}
        </ul>
        {addableOrgs.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={addOrgId} onValueChange={(id) => { setAddOrgId(id); setAddRole(""); }}>
              <SelectTrigger size="sm" className="min-w-48 flex-1" aria-label="Organization">
                <SelectValue placeholder="Add to an organization" />
              </SelectTrigger>
              <SelectContent>
                {addableOrgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {addOrgId && (
              <Select value={addRole} onValueChange={setAddRole}>
                <SelectTrigger size="sm" className="min-w-40" aria-label="Role">
                  <SelectValue placeholder="Choose a role" />
                </SelectTrigger>
                <SelectContent>
                  {addRoles.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" disabled={pending || !addOrgId || !addRole} onClick={addToOrg}>
              Add
            </Button>
          </div>
        )}
      </section>

      <section className="grid gap-3" aria-label="Status and contact">
        <h3 className="text-sm font-medium">Status</h3>
        <StatusSelect id={member.id} status={member.status} />
        {showContact && (
          <>
            <h3 className="text-sm font-medium">Contact</h3>
            <AdminContactForm userId={member.id} email={member.email ?? ""} phone={member.phone ?? ""} />
          </>
        )}
      </section>

      <section className="flex flex-wrap gap-2 border-t pt-4" aria-label="Actions">
        <Button variant="outline" size="sm" disabled={pending || member.status === "suspended"} onClick={() => setConfirm("suspend")}>
          Suspend
        </Button>
        <Button variant="destructive" size="sm" disabled={pending} onClick={() => setConfirm("remove")}>
          Remove from org
        </Button>
      </section>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "remove" ? `Remove ${label} from this organization?` : `Suspend ${label}?`}</DialogTitle>
            <DialogDescription>
              {confirm === "remove"
                ? "They lose access to this organization right away. You can add them back later."
                : "They are signed out everywhere and cannot sign in until you reactivate them."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Keep</Button>
            </DialogClose>
            <Button variant="destructive" disabled={pending} onClick={confirm === "remove" ? removeFromOrg : suspend}>
              {confirm === "remove" ? "Remove" : "Suspend"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
