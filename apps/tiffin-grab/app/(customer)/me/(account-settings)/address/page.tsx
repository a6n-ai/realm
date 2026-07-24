import { Suspense } from "react";
import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { AddressSection, AddressSectionSkeleton } from "@/components/account/sections/address-section";

export default function MeAddressPage() {
  return (
    <Suspense fallback={<AddressSectionSkeleton />}>
      <AddressData />
    </Suspense>
  );
}

async function AddressData() {
  const { user } = await requireAccountUser();
  return (
    <AddressSection
      addressLine={user.addressLine ?? ""}
      addressUnit={user.addressUnit ?? ""}
      city={user.city ?? ""}
      postalCode={user.postalCode ?? ""}
      province={user.province ?? ""}
    />
  );
}
