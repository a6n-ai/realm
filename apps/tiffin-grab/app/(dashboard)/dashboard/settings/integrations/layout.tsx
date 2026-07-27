import type { ReactNode } from "react";
import { PuzzleIcon } from "lucide-react";
import { PageHeader } from "@/components/ds";

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={PuzzleIcon}
        title="Integrations"
        subtitle="Install plugins here. Configure payment plugins under Settings → Payment, and Clover under Settings → Clover."
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
