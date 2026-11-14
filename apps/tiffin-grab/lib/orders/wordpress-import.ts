export const WP_PREFIX = "wc-";

/** Plan imported from WordPress: written by the one-off WordPress import as `wc-<wordpress order id>`. */
export const isWordpressImport = (o: { deploymentId: string }) => o.deploymentId.startsWith(WP_PREFIX);
