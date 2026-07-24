import { Suspense } from "react";
import { requireAccountUser } from "@/app/(dashboard)/dashboard/account/current-user";
import { DeliveryNotesSection } from "@/components/account/sections/delivery-notes-section";
import { DeliveryNotesSkeleton } from "@/app/(dashboard)/dashboard/account/delivery-notes/delivery-notes-skeleton";

export default function MeDeliveryNotesPage() {
  return (
    <Suspense fallback={<DeliveryNotesSkeleton />}>
      <DeliveryNotesData />
    </Suspense>
  );
}

async function DeliveryNotesData() {
  const { user } = await requireAccountUser();
  return <DeliveryNotesSection deliveryNotes={user.deliveryNotes ?? ""} />;
}
