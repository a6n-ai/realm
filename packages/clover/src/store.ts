import type { CloverConnection, IntegrationsConfig } from "./config";

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
  return (
    cfg.clover ?? {
      installed: false,
      connected: false,
      environment: "sandbox",
      region: "na",
    }
  );
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
  await setCloverConnection(store, {
    installed: false,
    connected: false,
    environment: "sandbox",
    region: "na",
  });
}

export async function disconnectClover(store: IntegrationsConfigStore): Promise<void> {
  const current = await getCloverConnection(store);
  await setCloverConnection(store, {
    ...current,
    connected: false,
    merchantId: undefined,
    tokens: undefined,
    connectedAt: undefined,
  });
}
