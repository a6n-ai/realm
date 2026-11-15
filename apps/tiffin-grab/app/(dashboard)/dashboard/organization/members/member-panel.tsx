"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@foundry/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { OrgRoleDialog, RoleChips, chipState, type PermissionMap, type ResourceLabel } from "@foundry/crm";
import { Badge } from "@/components/reui/badge";
import { ActionIcon } from "@/components/ds/action-icon";
import { AdminContactForm } from "@/components/dashboard/admin-contact-form";
import { AreaBadge, GroupHeading, SectionCard, UserAvatar } from "@/components/ds";
import { unwrapAction } from "@/lib/actions/unwrap";
import { groupResources } from "@/lib/auth/permission-groups";
import { addMemberAction, removeMemberAction } from "@/lib/services/organizations-actions";
import { createRole } from "../roles/actions";
import { setMemberRoles, setUserStatus } from "./actions";
import type { MemberPanelData } from "./member-panel-data";
import { ResetPasswordButton, StatusSelect } from "./user-row";

type Confirm = "remove" | "suspend" | null;

const STATUS_VARIANT = {
  active: "success-light",
  inactive: "invert-light",
  suspended: "warning-light",
  deleted: "destructive-light",
} as const;

export function MemberDetail({ data, resources }: { data: MemberPanelData; resources: ResourceLabel[] }) {
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

  // The person is gone from this org after a removal, so the page has nothing left to show.
  function removeFromOrg() {
    start(async () => {
      const res = await removeMemberAction(activeOrgId, member.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setConfirm(null);
      toast.success(`${label} was removed from this organization.`);
      router.push("/dashboard/organization/people");
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
      <header className="flex flex-wrap items-center gap-4">
        <UserAvatar name={member.name} fallbackText={member.email} presence={member.status === "active" ? "active" : "off"} />
        <div className="grid min-w-0 flex-1 gap-1">
          <h1 className="truncate text-xl font-semibold">{label}</h1>
          <p className="text-muted-foreground truncate text-sm">{member.email ?? "No email on file"}</p>
        </div>
        <Badge variant={STATUS_VARIANT[member.status]} className="capitalize">{member.status}</Badge>
      </header>

      <SectionCard title="Roles" subtitle="Their access is the union of these roles.">
        <div className="grid gap-3">
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
        </div>
      </SectionCard>

      <SectionCard title="Access by area" subtitle="Read only. The union of this person's roles.">
        {held.length === 0 ? (
          <p className="text-muted-foreground text-sm">No access yet. Add a role to give access.</p>
        ) : (
          <div className="grid gap-6">
            {groupResources(held).map(({ group, items }) => (
              <section key={group.key} className="grid gap-3" aria-label={group.label}>
                <GroupHeading group={group} />
                <ul className="grid gap-3">
                  {items.map((r) => (
                    <li key={r.resource} className="grid gap-1.5">
                      <span><AreaBadge resource={r.resource} label={r.label} /></span>
                      <span className="flex flex-wrap gap-1">
                        {r.actions.map((a) => (
                          <Badge key={a.action} variant="info-light"><ActionIcon action={a.action} />{a.label}</Badge>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Organizations">
        <div className="grid gap-4">
          <ul className="grid gap-2">
            {memberships.map((m) => (
              <li key={m.organizationId} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">{m.name}</span>
                {m.role && <Badge variant="primary-light" className="capitalize">{m.role}</Badge>}
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
        </div>
      </SectionCard>

      <SectionCard title="Contact and actions">
        <div className="grid gap-6">
          <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
            <span className="text-sm font-medium">Status</span>
            <StatusSelect id={member.id} status={member.status} />
            <span className="text-sm font-medium">Password</span>
            <div>
              <ResetPasswordButton id={member.id} role={member.role} passwordSet={member.passwordSet} />
            </div>
          </div>
          <div className="grid gap-3">
            <h3 className="text-sm font-medium">Contact</h3>
            <AdminContactForm userId={member.id} email={member.email ?? ""} phone={member.phone ?? ""} />
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button variant="outline" size="sm" disabled={pending || member.status === "suspended"} onClick={() => setConfirm("suspend")}>
              Suspend
            </Button>
            <Button variant="destructive" size="sm" disabled={pending} onClick={() => setConfirm("remove")}>
              Remove from org
            </Button>
          </div>
        </div>
      </SectionCard>

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
