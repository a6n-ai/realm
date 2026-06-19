import { notFound, redirect } from "next/navigation";
import { NotFoundError } from "@tiffin/commons";
import { requireStaff } from "@/lib/auth/guards";
import { inquiriesService } from "@/lib/services/inquiries.service";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
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

  const catalog = await loadCatalogSnapshot();

  return (
    <section className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Create order — {inq.fullName}</h1>
      <OrderForm
        inquiryId={inq.id}
        contact={{ fullName: inq.fullName, phone: inq.phone, email: inq.email ?? "" }}
        catalog={{
          plans: catalog.plans.map((p) => ({ key: p.key, name: p.name })),
          mealSizes: catalog.mealSizes.map((m) => ({ id: m.id, name: m.name, diet: m.diet })),
          frequencies: catalog.frequencies.map((f) => ({ key: f.key, name: f.name })),
          durations: catalog.durations.map((d) => ({ weeks: d.weeks })),
        }}
      />
    </section>
  );
}
