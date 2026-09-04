import { Suspense } from "react";
import { HelpCircleIcon } from "lucide-react";
import { PageHeader } from "@/components/ds";
import { requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { listAllFaqs } from "@/lib/services/faqs.service";
import { resolveSessionVisibleOrgIds } from "@/lib/services/orders.service";
import { FaqManager, FaqManagerSkeleton } from "./manager";

export default function PublicFaqSettingsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader icon={HelpCircleIcon} title="FAQ" subtitle="Questions and answers shown on the public /faq page." />
      <Suspense fallback={<FaqManagerSkeleton />}>
        <FaqData />
      </Suspense>
    </div>
  );
}

async function FaqData() {
  await requirePermission({ settings: ["read"] });
  const session = await getSession();
  const visible = await resolveSessionVisibleOrgIds(session);
  const faqs = await listAllFaqs(visible);
  return <FaqManager faqs={faqs} />;
}
