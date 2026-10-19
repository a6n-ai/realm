import { ShapesIcon } from "lucide-react";
import { PageHeader, PageShell, SectionCard } from "@foundry/design-system";
import { requirePermission } from "@/lib/auth/guards";
import { getDefaultPrices } from "@/lib/services/app-settings.service";
import { ClassForm } from "../class-form";

export default async function NewClassPage() {
  await requirePermission({ studioSession: ["create"] } as never);
  const defaultPrices = await getDefaultPrices();
  return (
    <PageShell>
      <PageHeader
        icon={ShapesIcon}
        title="New class"
        subtitle="The offering families will book. Publish when it should appear on What’s on, then schedule days from Sessions."
      />
      <SectionCard title="Class">
        <ClassForm defaultPrices={defaultPrices} />
      </SectionCard>
    </PageShell>
  );
}
