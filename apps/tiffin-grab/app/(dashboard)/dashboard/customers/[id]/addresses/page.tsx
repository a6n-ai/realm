import { addressScopeFor, addressService } from "@/lib/services/addresses.service";
import { CustomerAddresses } from "../customer-addresses";
import { loadCustomer } from "../data";

/** Addresses tab: the saved address book; the default one is where live plans deliver. */
export default async function CustomerAddressesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Same staff gate and not-found as the other tabs.
  await loadCustomer(id);
  const saved = await addressService.list(await addressScopeFor(id));
  return <CustomerAddresses customerPublicId={id} initial={saved} />;
}
