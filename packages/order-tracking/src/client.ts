import type { BetterAuthClientPlugin } from "better-auth/client";
import type { orderTracking } from "./plugin";

/**
 * Exposes the server endpoints as `authClient.orderTracking.verify(...)` and
 * `authClient.orderTracking.grant(...)` — Better Auth infers both from the
 * server plugin's paths.
 */
export const orderTrackingClient = () =>
  ({
    id: "order-tracking",
    $InferServerPlugin: {} as ReturnType<typeof orderTracking>,
    pathMethods: { "/order-tracking/verify": "POST" },
  }) satisfies BetterAuthClientPlugin;
