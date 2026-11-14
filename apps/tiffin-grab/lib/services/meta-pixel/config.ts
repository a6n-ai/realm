import { createMetaPixel } from "@foundry/meta-pixel";
import { metaPixelPlugin as plugin } from "@foundry/meta-pixel/server";
import { integrationsConfigReadStore, integrationsConfigStore } from "@/lib/payments/integrations-config";

// This app's Meta Pixel: @foundry/meta-pixel bound to tiffin-grab's integrations blob and master key.
export const metaPixel = createMetaPixel({
  store: integrationsConfigStore,
  readStore: integrationsConfigReadStore,
  masterKey: () => process.env.INTEGRATIONS_ENCRYPTION_KEY,
});

export const metaPixelPlugin = () => plugin(metaPixel);
export const getMetaPixelConfig = metaPixel.getConfig;
export const updateMetaPixelConfig = metaPixel.update;
export const getMetaPixelStatus = metaPixel.status;
