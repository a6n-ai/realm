import type { RelayRpcLike } from "./lib/mail/relay-mailer";

declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      RELAY: Fetcher & RelayRpcLike;
      ASSETS: Fetcher;
      BETTER_AUTH_URL: string;
      BETTER_AUTH_SECRET: string;
      RELAY_API_KEY?: string;
      MAILER?: string;
    }
  }
}

export type Env = Cloudflare.Env;
