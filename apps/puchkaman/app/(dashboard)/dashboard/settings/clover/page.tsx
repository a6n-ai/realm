import { Suspense } from "react";
import { CreditCardIcon } from "lucide-react";
import {
  CloverApiClient,
  getCloverConnection,
  loadCloverAppCredentialsFromEnv,
  setCloverConnection,
  toPublicCloverConnection,
  type CloverOrderType,
} from "@foundry/clover";
import { CloverSettingsPanel, CloverSettingsPanelSkeleton } from "@foundry/clover/ui";
import { PageHeader, PageShell } from "@foundry/design-system";
import { requireAdmin } from "@/lib/auth/guards";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import {
  connectCloverApiTokenAction,
  createCloverOrderTypeAction,
  disconnectCloverAction,
  setCloverWebOrderTypesAction,
  startCloverConnectAction,
  updateCloverOrderTypeAction,
} from "../integrations/actions";

export default async function CloverSettingsPage() {
  await requireAdmin();
  return (
    <PageShell>
      <PageHeader
        icon={CreditCardIcon}
        title="Clover"
        subtitle="Settings for the Clover plugin installed under Integrations."
      />
      <Suspense fallback={<CloverSettingsPanelSkeleton />}>
        <CloverSettingsLoader />
      </Suspense>
    </PageShell>
  );
}

async function CloverSettingsLoader() {
  const connection = await getCloverConnection(integrationsConfigStore);
  const clover = toPublicCloverConnection(connection);
  const credentials = loadCloverAppCredentialsFromEnv();

  const apiTokenMode = connection.authMode === "apiToken";

  let merchantName: string | undefined;
  let orderTypes: CloverOrderType[] = [];
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
      // Best-effort too: without it the panel shows the "no order types" hint
      // rather than failing the whole settings page.
      orderTypes = await client.listOrderTypes();
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
      orderTypes={orderTypes}
      onSaveWebOrderTypes={setCloverWebOrderTypesAction}
      onCreateOrderType={createCloverOrderTypeAction}
      onUpdateOrderType={updateCloverOrderTypeAction}
    />
  );
}
