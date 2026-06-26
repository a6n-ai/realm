import { DeliveryNotesSection } from "@/components/account/sections/delivery-notes-section";
import { requireSectionAccess } from "../current-user";

export default async function AccountDeliveryNotesPage() {
  const { user } = await requireSectionAccess("deliveryNotes");
  return <DeliveryNotesSection deliveryNotes={user.deliveryNotes ?? ""} />;
}
