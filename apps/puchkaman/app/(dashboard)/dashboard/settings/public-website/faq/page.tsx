import { SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { listAllFaqs } from "@/lib/services/faqs.service";
import { FaqEditor } from "./faq-editor";

export default async function PublicFaqPage() {
  await requirePermission({ settings: ["read"] });
  const faqs = await listAllFaqs();

  return (
    <SectionCard
      title="FAQ"
      subtitle="Shown on /faq and the home page's FAQ section. A franchise admin's entries here override the brand default for their own franchise; a brand admin edits the shared default."
    >
      <FaqEditor faqs={faqs} />
    </SectionCard>
  );
}
