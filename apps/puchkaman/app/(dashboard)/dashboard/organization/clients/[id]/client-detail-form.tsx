"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@realm/ui/button";
import { Input } from "@realm/ui/input";
import { AddressFields } from "@realm/ui/address-fields";
import { updateOrganizationAction } from "@/lib/services/organizations-actions";

export function ClientDetailForm({
  organizationId,
  organization,
  cities,
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
  cities: string[];
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

      <label className="text-sm text-muted-foreground" htmlFor="org-city">
        City
      </label>
      <Input id="org-city" list="org-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Toronto" />
      <datalist id="org-cities">
        {cities.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="col-span-2">
        <AddressFields
          idPrefix="org-address"
          fields={["addressLine"]}
          values={{ addressLine: address }}
          onChange={(patch) => {
            if (patch.addressLine !== undefined) setAddress(patch.addressLine);
          }}
          onResolve={({ lat, lng }) => {
            setStoreLat(String(lat));
            setStoreLng(String(lng));
          }}
          resolveUrl="/api/delivery/resolve"
        />
      </div>

      <label className="text-sm text-muted-foreground" htmlFor="org-store-lat">
        Latitude
      </label>
      <Input id="org-store-lat" value={storeLat} readOnly placeholder="Resolved from address" />

      <label className="text-sm text-muted-foreground" htmlFor="org-store-lng">
        Longitude
      </label>
      <Input id="org-store-lng" value={storeLng} readOnly placeholder="Resolved from address" />

      <div className="col-span-2">
        <Button type="submit" size="sm" disabled={pending || !name || !clientCode}>
          Save
        </Button>
      </div>
    </form>
  );
}
