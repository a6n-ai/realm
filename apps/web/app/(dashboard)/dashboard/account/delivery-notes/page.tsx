import { Suspense } from "react";
import { DeliveryNotesSection } from "@/components/account/sections/delivery-notes-section";
import { DeliveryNotesSkeleton } from "./delivery-notes-skeleton";
import { requireSectionAccess } from "../current-user";

export default function AccountDeliveryNotesPage() {
  return (
    <Suspense fallback={<DeliveryNotesSkeleton />}>
      <DeliveryNotesData />
    </Suspense>
  );
}

async function DeliveryNotesData() {
  const { user } = await requireSectionAccess("deliveryNotes");
  return <DeliveryNotesSection deliveryNotes={user.deliveryNotes ?? ""} />;
}
