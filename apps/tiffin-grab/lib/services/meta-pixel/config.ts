import { createMetaPixel } from "@foundry/meta-pixel";
import { integrationsMasterKey } from "@/lib/runtime/env";
import { metaPixelPlugin as plugin } from "@foundry/meta-pixel/server";
import { integrationsConfigReadStore, integrationsConfigStore } from "@/lib/payments/integrations-config";

// This app's Meta Pixel: @foundry/meta-pixel bound to tiffin-grab's integrations blob and master key.
export const metaPixel = createMetaPixel({
  store: integrationsConfigStore,
  readStore: integrationsConfigReadStore,
  masterKey: integrationsMasterKey,
});

export const metaPixelPlugin = () => plugin(metaPixel);
export const getMetaPixelConfig = metaPixel.getConfig;
export const updateMetaPixelConfig = metaPixel.update;
export const getMetaPixelStatus = metaPixel.status;
