import type { EventBridgeHandler } from "aws-lambda";

/** Ping the app's drain route; it claims + delivers due outbox rows. */
export const handler: EventBridgeHandler<"Scheduled Event", unknown, void> = async () => {
  const url = process.env.DRAIN_URL;
  const secret = process.env.DRAIN_SECRET;
  if (!url || !secret) throw new Error("DRAIN_URL / DRAIN_SECRET not configured");

  const res = await fetch(url, { method: "POST", headers: { "x-drain-secret": secret } });
  if (!res.ok) throw new Error(`drain failed: ${res.status} ${await res.text()}`);
  console.log("drain ok", await res.json());
};
