import { Suspense } from "react";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { ensurePaymentCatalog } from "@/lib/services/app-settings.service";
import { PaymentsForm, PaymentsFormSkeleton } from "../payments-form";

type Props = { params: Promise<{ methodId: string }> };

export default async function PaymentMethodSettingsPage({ params }: Props) {
  await requireAdmin();
  const { methodId } = await params;
  return (
    <Suspense fallback={<PaymentsFormSkeleton />}>
      <MethodFormLoader methodId={methodId} />
    </Suspense>
  );
}

async function MethodFormLoader({ methodId }: { methodId: string }) {
  if (methodId !== "cash" && methodId !== "etransfer") notFound();
  const cfg = await ensurePaymentCatalog();
  const method = cfg.methods.find((m) => m.id === methodId);
  if (!method) notFound();
  return <PaymentsForm initial={cfg} activeMethodId={methodId} />;
}
