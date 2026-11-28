import type { RelayRpcLike } from "./lib/mail/relay-mailer";
import type { SecretValue } from "./lib/secrets";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      RELAY: Fetcher & RelayRpcLike;
      ASSETS: Fetcher;
      BETTER_AUTH_URL: string;
      BETTER_AUTH_SECRET: SecretValue;
      RELAY_API_KEY?: SecretValue;
      COLLAB_SECRET?: SecretValue;
      COLLAB_ROOM: DurableObjectNamespace<import("./lib/meeting-docs/room").CollabRoom>;
      MAILER?: string;
    }
  }
}

export type Env = Cloudflare.Env;
