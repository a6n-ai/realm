import { Suspense } from "react";
import { AddressSection } from "@/components/account/sections/address-section";
import { requireSectionAccess } from "../current-user";

export default function AccountAddressPage() {
  return (
    <Suspense fallback={<AddressSection.Skeleton />}>
      <AddressData />
    </Suspense>
  );
}

async function AddressData() {
  const { user } = await requireSectionAccess("address");
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
