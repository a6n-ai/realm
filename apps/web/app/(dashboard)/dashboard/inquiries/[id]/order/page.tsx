import { notFound, redirect } from "next/navigation";
import { NotFoundError } from "@tiffin/commons";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { mealSlotsService } from "@/lib/services/meal-slots.service";
import { OrderForm } from "./order-form";

export default async function AgentOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  let inq;
  try {
    inq = await inquiriesService.read(id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  if (inq.stage === "converted") redirect(`/dashboard/inquiries/${id}`);

  const [catalog, slots] = await Promise.all([loadCatalogSnapshot(), mealSlotsService.enabledSlots()]);
  const enabledSlots = slots.map((s) => ({ key: s.key, label: s.label }));

  return (
    <section className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Create order — {inq.fullName}</h1>
      <OrderForm
        inquiryId={inq.publicId}
        contact={{ fullName: inq.fullName, phone: inq.phone, email: inq.email ?? "" }}
        catalog={{
          plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
          mealSizes: catalog.mealSizes.map((m) => ({ id: m.publicId, name: m.name, diet: m.diet })),
          frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name })),
          durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
        }}
        enabledSlots={enabledSlots}
      />
    </section>
  );
}
