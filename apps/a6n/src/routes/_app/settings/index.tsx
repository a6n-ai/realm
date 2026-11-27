import { FormError } from "@foundry/console/form-error";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { toast } from "@foundry/ui/toast";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { type FormEvent, useId, useState } from "react";
import { SettingsCard } from "../../../components/page/settings-card";
import { errorText } from "../../../lib/error-copy";
import { renameOwnOrganizationFn } from "../../../lib/organization/organization.fns";

export const Route = createFileRoute("/_app/settings/")({ component: GeneralPage });

function GeneralPage() {
  const { shell } = Route.useRouteContext();
  const router = useRouter();
  const formId = useId();
  const current = shell.organization?.name ?? "";
  const canRename = shell.permissions.includes("organization:update");
  const [name, setName] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const dirty = name.trim() !== current && name.trim() !== "";

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await renameOwnOrganizationFn({ data: { name } });
      if (!res.ok) return setError(errorText(new Error(res.code)));
      toast.success("Organisation renamed", { description: name.trim() });
      await router.invalidate();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <SettingsCard
      title="Organisation name"
      description="The name people see in the sidebar and in invites."
      footer={canRename ? (dirty ? "Unsaved changes" : "Up to 80 characters.") : "Only owners and admins can rename the organisation."}
      action={
        canRename ? (
          <Button type="submit" form={formId} variant="outline" disabled={pending || !dirty}>
            Save name
          </Button>
        ) : undefined
      }
    >
      <form id={formId} onSubmit={submit} className="grid gap-2">
        <Input aria-label="Organisation name" className="max-w-sm" maxLength={80} readOnly={!canRename} value={name} onChange={(e) => setName(e.target.value)} />
        <FormError error={error} />
      </form>
    </SettingsCard>
  );
}
