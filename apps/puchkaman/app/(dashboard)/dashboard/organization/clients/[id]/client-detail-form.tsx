"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { AddressFields } from "@realm/ui/address-fields";
import { StaticMap } from "@realm/design-system";
import { updateOrganizationAction } from "@/lib/services/organizations-actions";

export function ClientDetailForm({
  organizationId,
  organization,
}: {
  organizationId: string;
  organization: {
    name: string;
    clientCode: string;
    region: string | null;
    city: string | null;
    address: string | null;
    storeLat: string | null;
    storeLng: string | null;
  };
}) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [clientCode, setClientCode] = useState(organization.clientCode);
  const [region, setRegion] = useState(organization.region ?? "");
  const [city, setCity] = useState(organization.city ?? "");
  const [address, setAddress] = useState(organization.address ?? "");
  const [storeLat, setStoreLat] = useState(organization.storeLat ?? "");
  const [storeLng, setStoreLng] = useState(organization.storeLng ?? "");
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
            city: city || null,
            address: address || null,
            storeLat: storeLat || null,
            storeLng: storeLng || null,
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
        <AddressFields
          idPrefix="org-address"
          fields={["addressLine", "city"]}
          values={{ addressLine: address, city }}
          onChange={(patch) => {
            if (patch.addressLine !== undefined) setAddress(patch.addressLine);
            if (patch.city !== undefined) setCity(patch.city);
          }}
          onResolve={({ lat, lng }) => {
            setStoreLat(String(lat));
            setStoreLng(String(lng));
          }}
          resolveUrl="/api/delivery/resolve"
        />
      </div>

      {storeLat && storeLng && (
        <div className="col-span-2 grid gap-1.5">
          <p className="text-sm text-muted-foreground">Pinned location</p>
          <StaticMap
            center={{ lat: Number(storeLat), lng: Number(storeLng) }}
            markers={[{ lat: Number(storeLat), lng: Number(storeLng) }]}
            heightPx={200}
            className="overflow-hidden rounded-lg outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
          />
        </div>
      )}

      <div className="col-span-2">
        <Button
          type="submit"
          size="sm"
          disabled={pending || !name || !clientCode}
          className="cursor-pointer transition-transform active:scale-[0.96]"
        >
          Save
        </Button>
      </div>
    </form>
  );
}
