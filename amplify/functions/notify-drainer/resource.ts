import { defineFunction, secret } from "@aws-amplify/backend";

/**
 * Scheduled outbox drainer. Does NOT bundle the app — it POSTs the secret to
 * the app's /api/notifications/drain route, which runs all delivery logic
 * (where the Postgres client lives). Keeps one source of truth for sending.
 */
export const notifyDrainer = defineFunction({
  name: "notify-drainer",
  entry: "./handler.ts",
  schedule: "every 1m",
  timeoutSeconds: 60,
  environment: {
    DRAIN_URL: process.env.DRAIN_URL ?? "",
    DRAIN_SECRET: secret("DRAIN_SECRET"),
  },
});
