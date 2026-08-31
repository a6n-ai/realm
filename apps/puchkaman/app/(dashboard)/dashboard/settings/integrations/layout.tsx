import type { ReactNode } from "react";
import { PuzzleIcon } from "lucide-react";
import { PageHeader, PageShell } from "@foundry/design-system";

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <PageShell>
      <PageHeader
        icon={PuzzleIcon}
        title="Integrations"
        subtitle="Install plugins here. Configure Clover under Settings → Clover after installing."
      />
      <div className="min-w-0">{children}</div>
    </PageShell>
  );
}
