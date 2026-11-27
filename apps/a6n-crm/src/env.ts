// Placeholder: Task 12 replaces it with the structural Relay RPC type.
type RelayRpcLike = unknown;

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
