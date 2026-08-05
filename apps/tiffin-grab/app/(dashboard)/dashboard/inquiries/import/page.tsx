import { UploadIcon } from "lucide-react";
import { PageShell, PageHeader, SectionCard } from "@/components/ds";
import { requireStaff } from "@/lib/auth/guards";
import { loadSourceOptions } from "@/lib/list/facet-options";
import { ImportForm } from "./import-form";

export default async function ImportInquiriesPage() {
  await requireStaff();
  const { sources } = await loadSourceOptions();

  return (
    <PageShell>
      <PageHeader
        icon={UploadIcon}
        title="Import inquiries"
        subtitle="Bulk-create or update inquiries from an Excel sheet."
      />
      <SectionCard title="Upload">
        <ImportForm sources={sources.map((s) => ({ key: s.value, label: s.label }))} />
      </SectionCard>
    </PageShell>
  );
}
