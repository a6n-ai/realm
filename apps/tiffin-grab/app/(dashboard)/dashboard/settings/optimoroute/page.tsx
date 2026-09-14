import { TruckIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { getOptimoRouteConfig, getOptimoRouteStatus } from "@/lib/services/optimoroute/config";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";

export default async function OptimoRouteSettingsPage() {
  await requireAdmin();
  const [status, cfg] = await Promise.all([getOptimoRouteStatus(), getOptimoRouteConfig()]);
  const driverCodes = Object.entries(cfg.driverCodes);

  return (
    <div className="grid gap-6">
      <PageHeader
        icon={TruckIcon}
        title="OptimoRoute"
        subtitle="Settings for the OptimoRoute plugin installed under Integrations."
      />

      <div className="space-y-2">
        <Badge variant={status.hasApiKey ? "default" : "destructive"}>
          {status.hasApiKey ? "Connected" : "Missing API key"}
        </Badge>
        {!status.hasApiKey ? (
          <p className="text-muted-foreground text-sm">
            Set OPTIMOROUTE_API_KEY on the server to enable route dispatch.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium">Driver codes</h2>
        {driverCodes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No driver codes configured yet.</p>
        ) : (
          <ul className="text-sm">
            {driverCodes.map(([serial, code]) => (
              <li key={serial} className="flex justify-between border-b py-1 last:border-0">
                <span className="text-muted-foreground">{serial}</span>
                <span>{code}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
