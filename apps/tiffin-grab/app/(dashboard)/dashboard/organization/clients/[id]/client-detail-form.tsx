"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { updateOrganizationAction } from "@/lib/services/organizations-actions";

export function ClientDetailForm({
  organizationId,
  organization,
}: {
  organizationId: string;
  organization: { name: string; clientCode: string; region: string | null };
}) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [clientCode, setClientCode] = useState(organization.clientCode);
  const [region, setRegion] = useState(organization.region ?? "");
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="grid grid-cols-2 gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateOrganizationAction(organizationId, {
            name,
            clientCode,
            region: region || null,
          });
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          toast.success("Saved.");
          router.refresh();
        });
      }}
    >
      <label className="text-sm text-muted-foreground" htmlFor="org-name">
        Name
      </label>
      <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} />

      <label className="text-sm text-muted-foreground" htmlFor="org-client-code">
        Client code
      </label>
      <Input id="org-client-code" value={clientCode} onChange={(e) => setClientCode(e.target.value)} />

      <label className="text-sm text-muted-foreground" htmlFor="org-region">
        Region
      </label>
      <Input id="org-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="—" />

      <div className="col-span-2">
        <Button type="submit" size="sm" disabled={pending || !name || !clientCode}>
          Save
        </Button>
      </div>
    </form>
  );
}
