import { Suspense } from "react";
import { CreditCardIcon } from "lucide-react";
import {
  CloverApiClient,
  getCloverConnection,
  loadCloverAppCredentialsFromEnv,
  setCloverConnection,
  toPublicCloverConnection,
} from "@foundry/clover";
import { CloverSettingsPanel, CloverSettingsPanelSkeleton } from "@foundry/clover/ui";
import { requireAdmin } from "@/lib/auth/guards";
import { PageHeader } from "@/components/ds";
import { integrationsConfigStore } from "@/lib/services/app-settings.service";
import {
  connectCloverApiTokenAction,
  disconnectCloverAction,
  startCloverConnectAction,
} from "../integrations/clover-actions";

export default async function CloverSettingsPage() {
  await requireAdmin();
  return (
    <div className="grid gap-6">
      <PageHeader
        icon={CreditCardIcon}
        title="Clover"
        subtitle="Settings for the Clover plugin installed under Integrations."
      />
      <Suspense fallback={<CloverSettingsPanelSkeleton />}>
        <CloverSettingsLoader />
      </Suspense>
    </div>
  );
}

async function CloverSettingsLoader() {
  const connection = await getCloverConnection(integrationsConfigStore);
  const clover = toPublicCloverConnection(connection);
  const credentials = loadCloverAppCredentialsFromEnv();

  const apiTokenMode = connection.authMode === "apiToken";

  let merchantName: string | undefined;
  // API-token mode carries its own credential, so it needs no app env creds.
  const canProbe =
    clover.connected && (apiTokenMode ? Boolean(connection.apiToken) : Boolean(credentials));
  if (canProbe) {
    try {
      const client = new CloverApiClient({
        credentials: apiTokenMode ? undefined : credentials!,
        connection,
        onTokensRefreshed: apiTokenMode
          ? undefined
          : async (tokens) => {
              const latest = await getCloverConnection(integrationsConfigStore);
              await setCloverConnection(integrationsConfigStore, {
                ...latest,
                tokens,
                connected: true,
              });
            },
      });
      merchantName = (await client.getMerchant()).name;
    } catch {
      // Best-effort — panel still renders merchant id without display name.
    }
  }

  return (
    <CloverSettingsPanel
      clover={clover}
      merchantName={merchantName}
      credentialsConfigured={Boolean(credentials)}
      integrationsHref="/dashboard/settings/integrations"
      onConnect={startCloverConnectAction}
      onDisconnect={disconnectCloverAction}
      onConnectApiToken={connectCloverApiTokenAction}
    />
  );
}
