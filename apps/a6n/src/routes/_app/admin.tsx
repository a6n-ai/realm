import { ErrorState } from "@foundry/console/error-state";
import { FormError } from "@foundry/console/form-error";
import { ListSkeleton } from "@foundry/console/list-skeleton";
import { RowMenu } from "@foundry/console/row-menu";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";
import { SettingsCard } from "../../components/page/settings-card";
import { ResponsiveDialog } from "../../components/responsive-dialog";
import { PageHeader } from "../../components/shell/page-header";
import { errorText } from "../../lib/error-copy";
import type { OrgRow } from "../../lib/platform/service";
import { addOwnerFn, createOrganizationFn, listOrganizationsFn, renameOrganizationFn } from "../../lib/platform/platform.fns";

export const Route = createFileRoute("/_app/admin")({
  loader: async () => {
    const orgs = await listOrganizationsFn();
    if (orgs === null) throw notFound();
    return orgs;
  },
  pendingComponent: () => <ListSkeleton />,
  errorComponent: ({ error }) => {
    const router = useRouter();
    return <ErrorState error={error} errorText={errorText} onRetry={() => void router.invalidate()} />;
  },
  component: AdminPage,
});

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function Field({ id, label, ...props }: { id: string; label: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} required {...props} />
    </div>
  );
}

function CreateOrganizationCard() {
  const router = useRouter();
  const formId = useId();
  const [v, setV] = useState({ name: "", slug: "", ownerEmail: "", ownerName: "" });
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await createOrganizationFn({ data: v });
      if (!res) return setError(errorText(new Error("forbidden")));
      if (!res.ok) return setError(errorText(new Error(res.code)));
      toast.success(res.sent ? `${v.name} created; invite sent to ${v.ownerEmail}` : `${v.name} created; copy the invite link from its Members page`);
      setV({ name: "", slug: "", ownerEmail: "", ownerName: "" });
      setTouchedSlug(false);
      await router.invalidate();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsCard
      title="Create organisation"
      description="Each organisation has its own people, roles, inquiries and sources."
      footer="The first owner gets an invite to set a password."
      action={
        <Button type="submit" form={formId} disabled={pending}>
          Create organisation
        </Button>
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field id="org-name" label="Name" maxLength={80} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value, slug: touchedSlug ? v.slug : slugify(e.target.value) })} />
        <Field id="org-slug" label="Short name" maxLength={40} value={v.slug} onChange={(e) => (setTouchedSlug(true), setV({ ...v, slug: e.target.value }))} />
        <Field id="org-owner-email" label="First owner's email" type="email" maxLength={254} value={v.ownerEmail} onChange={(e) => setV({ ...v, ownerEmail: e.target.value })} />
        <Field id="org-owner-name" label="First owner's name" maxLength={200} value={v.ownerName} onChange={(e) => setV({ ...v, ownerName: e.target.value })} />
        <div className="sm:col-span-2">
          <FormError error={error} />
        </div>
      </form>
    </SettingsCard>
  );
}

type Edit = { kind: "rename" | "owner"; org: OrgRow };

function EditDialog({ edit, onClose }: { edit: Edit; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(edit.kind === "rename" ? edit.org.name : "");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res =
        edit.kind === "rename"
          ? await renameOrganizationFn({ data: { id: edit.org.id, name } })
          : await addOwnerFn({ data: { id: edit.org.id, email, name } });
      if (!res) return setError(errorText(new Error("forbidden")));
      if (!res.ok) return setError(errorText(new Error(res.code)));
      toast.success(edit.kind === "rename" ? "Organisation renamed" : `${email} is an owner of ${edit.org.name}`);
      onClose();
      await router.invalidate();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={edit.kind === "rename" ? `Rename ${edit.org.name}` : `Add an owner to ${edit.org.name}`}>
      <form onSubmit={submit} className="grid gap-4">
        {edit.kind === "owner" ? <Field id="owner-email" label="Email" type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /> : null}
        <Field id="edit-name" label={edit.kind === "rename" ? "Name" : "Their name"} maxLength={edit.kind === "rename" ? 80 : 200} value={name} onChange={(e) => setName(e.target.value)} />
        <FormError error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{edit.kind === "rename" ? "Save name" : "Add owner"}</Button>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

function AdminPage() {
  const orgs = Route.useLoaderData();
  const [edit, setEdit] = useState<Edit | null>(null);
  return (
    <>
      <PageHeader crumbs={[{ label: "Organisations" }]} description="Platform administration. Only super admins see this page." />
      <div className="grid max-w-4xl gap-6 px-4 pb-8">
        <CreateOrganizationCard />
        <SettingsCard title="All organisations" footer={`${orgs.length} ${orgs.length === 1 ? "organisation" : "organisations"}`}>
          <ul className="grid divide-y">
            {orgs.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="grid min-w-0 flex-1 gap-1">
                  <span className="font-medium text-(--strong)">{o.name}</span>
                  <span className="text-sm text-muted-foreground">
                    {o.slug} · {o.memberCount} {o.memberCount === 1 ? "member" : "members"}
                  </span>
                </div>
                <RowMenu
                  label={`Actions for ${o.name}`}
                  actions={[
                    { label: "Rename", onSelect: () => setEdit({ kind: "rename", org: o }) },
                    { label: "Add owner", onSelect: () => setEdit({ kind: "owner", org: o }) },
                  ]}
                />
              </li>
            ))}
          </ul>
        </SettingsCard>
      </div>
      {edit ? <EditDialog key={`${edit.kind}-${edit.org.id}`} edit={edit} onClose={() => setEdit(null)} /> : null}
    </>
  );
}
