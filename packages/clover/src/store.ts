import { DEFAULT_CLOVER_CONNECTION } from "./config";
import type {
  CloverApiTokenConnectInput,
  CloverConnection,
  IntegrationsConfig,
} from "./config";

/**
 * App-injected persistence for integrations config.
 * Mirrors tiffin-grab's getPaymentConfig / setPaymentConfig pattern —
 * the package never imports an app or DB.
 */
export type IntegrationsConfigStore = {
  get(): Promise<IntegrationsConfig>;
  set(cfg: IntegrationsConfig): Promise<void>;
};

export async function getCloverConnection(
  store: IntegrationsConfigStore,
): Promise<CloverConnection> {
  const cfg = await store.get();
  return cfg.clover ?? { ...DEFAULT_CLOVER_CONNECTION };
}

export async function setCloverConnection(
  store: IntegrationsConfigStore,
  clover: CloverConnection,
): Promise<void> {
  const cfg = await store.get();
  await store.set({ ...cfg, clover });
}

export async function installCloverPlugin(store: IntegrationsConfigStore): Promise<void> {
  const current = await getCloverConnection(store);
  await setCloverConnection(store, {
    ...current,
    installed: true,
    connected: current.connected,
  });
}

export async function uninstallCloverPlugin(store: IntegrationsConfigStore): Promise<void> {
  // Removing the plugin clears tokens — merchant must reconnect after reinstall.
  await setCloverConnection(store, { ...DEFAULT_CLOVER_CONNECTION });
}

/**
 * Connect a merchant with a permanent API token from their Clover dashboard
 * (Setup → API Tokens) instead of the developer-app OAuth flow.
 * Callers must verify the token against the Clover API before persisting.
 * No webhooks in this mode — Clover only delivers those to a registered app.
 */
export async function connectCloverWithApiToken(
  store: IntegrationsConfigStore,
  input: CloverApiTokenConnectInput,
): Promise<void> {
  const current = await getCloverConnection(store);
  await setCloverConnection(store, {
    ...current,
    installed: true,
    connected: true,
    authMode: "apiToken",
    merchantId: input.merchantId,
    apiToken: input.apiToken,
    environment: input.environment,
    region: input.region,
    tokens: undefined,
    connectedAt: new Date().toISOString(),
  });
}

export async function disconnectClover(store: IntegrationsConfigStore): Promise<void> {
  const current = await getCloverConnection(store);
  await setCloverConnection(store, {
    ...current,
    connected: false,
    authMode: "oauth",
    merchantId: undefined,
    tokens: undefined,
    apiToken: undefined,
    connectedAt: undefined,
  });
}
