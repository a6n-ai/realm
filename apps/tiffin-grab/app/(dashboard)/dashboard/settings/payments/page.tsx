import Link from "next/link";
import { redirect } from "next/navigation";
import { PuzzleIcon } from "lucide-react";
import { Button } from "@realm/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { getPaymentConfig } from "@/lib/services/app-settings.service";

export default async function PaymentsSettingsIndex() {
  await requireAdmin();
  const cfg = await getPaymentConfig();
  const first = cfg.methods[0];
  if (first) redirect(`/dashboard/settings/payments/${first.id}`);

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-6">
      <span className="bg-muted text-muted-foreground grid size-10 place-items-center rounded-lg">
        <PuzzleIcon className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="font-medium">No payment plugins installed</p>
        <p className="text-muted-foreground text-sm">
          Method tabs show up here after you add a payment plugin under Integrations. Until then
          the app stays in simulated mode.
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href="/dashboard/settings/integrations">Browse plugins</Link>
      </Button>
    </div>
  );
}
