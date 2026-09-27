import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { AccountPage } from "@/components/customer/account/account-page";
import { sectionFromSlug, sectionsForRole } from "@/components/customer/account/sections.config";
import { addressScopeFor, addressService } from "@/lib/services/addresses.service";
import { dropOffsFor } from "@/lib/services/address-drop-off.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { toClientCatalog } from "@/lib/catalog/types";
import { dropOffCatalog } from "@/lib/catalog/drop-off";
import { resolveRequestOrg } from "@/lib/tenant/resolve-request-org";

export default async function MeAccountPage({ searchParams }: { searchParams: Promise<{ section?: string }> }) {
  const [{ user, role }, sp] = await Promise.all([requireAccountUser(), searchParams]);
  const active = sectionFromSlug(sp.section, sectionsForRole(role));
  const onAddresses = active?.key === "address";
  const addresses = onAddresses ? await addressService.list(await addressScopeFor(user.publicId)) : [];
  const [dropOffs, catalog] = onAddresses
    ? await Promise.all([dropOffsFor(addresses.map((a) => a.publicId)), loadCatalogSnapshot(await resolveRequestOrg())])
    : [{}, null];
  const dropOff = catalog ? dropOffCatalog(toClientCatalog(catalog).deliveryCharges, catalog.waivers) : undefined;
  return (
    <AccountPage
      role={role}
      active={active}
      addresses={addresses}
      dropOff={dropOff}
      dropOffs={dropOffs}
      user={{
        name: user.name ?? null,
        email: user.email ?? "",
        phone: user.phone ?? null,
        image: user.image ?? null,
        username: user.displayUsername ?? user.username ?? null,
        emailVerified: user.emailVerified ?? false,
        phoneVerified: user.phoneVerified ?? false,
        addressLine: user.addressLine ?? "",
        addressUnit: user.addressUnit ?? "",
        city: user.city ?? "",
        postalCode: user.postalCode ?? "",
        province: user.province ?? "",
        dietaryNotes: user.dietaryNotes ?? "",
        allergens: (user.allergens ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
        notifyEmail: user.notifyEmail ?? true,
        notifySms: user.notifySms ?? false,
        hasPin: Boolean(user.pinHash),
      }}
    />
  );
}
