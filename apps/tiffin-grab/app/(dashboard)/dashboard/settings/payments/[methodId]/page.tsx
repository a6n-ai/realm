import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
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
  const cfg = await getPaymentConfig();
  if (cfg.methods.length === 0) redirect("/dashboard/settings/payments");

  const method = cfg.methods.find((m) => m.id === methodId);
  if (!method) notFound();

  return <PaymentsForm initial={cfg} activeMethodId={methodId} />;
}
