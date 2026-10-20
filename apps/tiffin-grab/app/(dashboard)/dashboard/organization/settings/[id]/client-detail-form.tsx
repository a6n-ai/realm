"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MapPinIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { AddressFields, defaultAddressUi, type AddressFieldSlotProps } from "@foundry/ui/address-fields";
import type { OrgLocation } from "@foundry/commons";
import { SectionCard, StaticMap } from "@/components/ds";
import { updateOrganizationAction } from "@/lib/services/organizations-actions";

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}

// The shared form labels this "Street address"; here it holds the whole postal address.
const addressUi = { Field: (p: AddressFieldSlotProps) => <defaultAddressUi.Field {...p} label="Address" /> };

export function ClientDetailForm({
  organizationId,
  organization,
  cities,
  isBrand,
}: {
  organizationId: string;
  organization: { name: string; clientCode: string; region: string | null } & OrgLocation;
  cities: string[];
  isBrand: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(organization.name);
  const [clientCode, setClientCode] = useState(organization.clientCode);
  const [region, setRegion] = useState(organization.region ?? "");
  const [city, setCity] = useState(organization.city ?? "");
  const [address, setAddress] = useState(organization.address ?? "");
  const [pin, setPin] = useState(
    organization.latitude != null && organization.longitude != null
      ? { lat: organization.latitude, lng: organization.longitude }
      : null,
  );
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const result = await updateOrganizationAction(organizationId, {
            name,
            clientCode,
            region: region || null,
            city: city || null,
            address: address || null,
            latitude: pin?.lat ?? null,
            longitude: pin?.lng ?? null,
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
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Details" subtitle="How this client is named and identified.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="org-name" label="Name">
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <Field id="org-client-code" label="Client code" hint="Short unique code, used in order numbers.">
              <Input id="org-client-code" value={clientCode} onChange={(e) => setClientCode(e.target.value)} required className="font-mono" />
            </Field>
            <Field id="org-region" label="Region">
              <Input id="org-region" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Optional" />
            </Field>
            <Field id="org-city" label="City">
              <Input id="org-city" list="org-cities" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Toronto" />
              <datalist id="org-cities">
                {cities.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
        </SectionCard>

        <SectionCard
          title="Location"
          subtitle={
            isBrand
              ? "Printed as the postal address in the footer of every campaign email."
              : "Where this franchise operates from; shown on the map when customers pick a location."
          }
        >
          <div className="flex flex-col gap-4">
            <AddressFields
              idPrefix="org"
              fields={["addressLine"]}
              values={{ addressLine: address }}
              onChange={(patch) => {
                // ponytail: a resolve patch carries city/postalCode/province; keep the picked full
                // label as the address (the footer needs it whole) and only take the city from it.
                if ("city" in patch || "postalCode" in patch || "province" in patch) {
                  if (patch.city && !city) setCity(patch.city);
                  return;
                }
                if (patch.addressLine !== undefined) {
                  setAddress(patch.addressLine);
                  setPin(null);
                }
              }}
              onResolve={(p) => setPin({ lat: p.lat, lng: p.lng })}
              resolveUrl="/api/address/resolve"
              ui={addressUi}
            />
            {pin ? (
              <div className="flex flex-col gap-2">
                <StaticMap center={pin} markers={[{ ...pin, title: name }]} zoom={14} heightPx={200} className="overflow-hidden rounded-lg border" />
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs tabular-nums">
                  <MapPinIcon className="size-3.5" />
                  {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <MapPinIcon className="size-3.5" />
                {address ? "Pick a suggestion from the search to place this address on the map." : "Search for the address to place it on the map."}
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !name || !clientCode}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
