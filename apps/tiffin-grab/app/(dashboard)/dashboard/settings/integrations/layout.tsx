import type { ReactNode } from "react";
import { PuzzleIcon } from "lucide-react";
import { PageHeader } from "@/components/ds";

export default function IntegrationsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={PuzzleIcon}
        title="Plugin marketplace"
        subtitle="Add payments, marketing and delivery tools. Install a plugin, then open it to set it up."
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
