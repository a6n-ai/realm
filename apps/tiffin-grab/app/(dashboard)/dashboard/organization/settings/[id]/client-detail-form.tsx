"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import type { OrgLocation } from "@foundry/commons";
import { updateOrganizationAction } from "@/lib/services/organizations-actions";

export function ClientDetailForm({
  organizationId,
  organization,
  cities,
}: {
  organizationId: string;
  organization: { name: string; clientCode: string; region: string | null } & OrgLocation;
  cities: string[];
}) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [clientCode, setClientCode] = useState(organization.clientCode);
  const [region, setRegion] = useState(organization.region ?? "");
  const [city, setCity] = useState(organization.city ?? "");
  const [address, setAddress] = useState(organization.address ?? "");
  const [latitude, setLatitude] = useState(organization.latitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(organization.longitude?.toString() ?? "");
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
            latitude: latitude ? Number(latitude) : null,
            longitude: longitude ? Number(longitude) : null,
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

      <label className="text-sm text-muted-foreground" htmlFor="org-address">
        Address
      </label>
      <Input id="org-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />

      <label className="text-sm text-muted-foreground" htmlFor="org-latitude">
        Latitude
      </label>
      <Input
        id="org-latitude"
        type="number"
        step="any"
        value={latitude}
        onChange={(e) => setLatitude(e.target.value)}
        placeholder="43.6532"
      />

      <label className="text-sm text-muted-foreground" htmlFor="org-longitude">
        Longitude
      </label>
      <Input
        id="org-longitude"
        type="number"
        step="any"
        value={longitude}
        onChange={(e) => setLongitude(e.target.value)}
        placeholder="-79.3832"
      />

      <div className="col-span-2">
        <Button type="submit" size="sm" disabled={pending || !name || !clientCode}>
          Save
        </Button>
      </div>
    </form>
  );
}
