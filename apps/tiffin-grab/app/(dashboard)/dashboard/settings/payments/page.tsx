import { Suspense } from "react";
import { CreditCardIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";
import { PageHeader, SectionCard } from "@/components/ds";
import { PaymentsForm, PaymentsFormSkeleton } from "./payments-form";

export default function PaymentsSettingsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader icon={CreditCardIcon} title="Payments" />
      <SectionCard
        title="Payment methods"
        subtitle="Enable how customers pay, set instructions, and add per-method taxes. Nothing enabled = simulated mode."
      >
        <Suspense fallback={<PaymentsFormSkeleton />}>
          <PaymentsData />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function PaymentsData() {
  await requireAdmin();
  const cfg = await getPaymentConfig();
  return <PaymentsForm initial={cfg} />;
}
