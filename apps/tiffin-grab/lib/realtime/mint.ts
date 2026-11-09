import { signRealtimeToken } from "@foundry/realtime";
import { authorizeChannel } from "./authorize";
import { realtimeConfigFromEnv } from "@foundry/realtime/server";

export type RealtimeBootstrap = { url: string; token: string };

/** Mint short-lived Worker tokens for the channels the shell will open on first paint. */
export async function mintRealtimeTokens(channels: string[]): Promise<Record<string, RealtimeBootstrap>> {
  const cfg = realtimeConfigFromEnv();
  if (!cfg) return {};

  const out: Record<string, RealtimeBootstrap> = {};
  for (const channel of channels) {
    const auth = await authorizeChannel(channel);
    if (!auth) continue;
    const token = await signRealtimeToken(cfg.secret, {
      channel: auth.channel,
      userId: auth.userId,
      role: auth.role,
    });
    out[auth.channel] = { url: cfg.url, token };
  }
  return out;
}
