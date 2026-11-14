import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { R2BucketLike } from "@foundry/storage";

/** The Cloudflare Images binding, as protect-thumbnail uses it. */
export type Images = {
  input(stream: ReadableStream): {
    transform(o: { blur: number }): {
      draw(overlay: unknown, o: { opacity: number; repeat: boolean }): {
        output(o: { format: "image/webp" }): Promise<{ response(): Response }>;
      };
    };
  };
};

export interface KvLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, opts?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(opts: { prefix: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

type Workflow = { create(o: { id: string; params: { at: number } }): Promise<unknown> };

/** Bindings declared in wrangler.jsonc. Read per call: Workers bind env per request, never hold it. */
export type CfEnv = {
  CACHE: KvLike;
  FILES?: R2BucketLike;
  OUTBOX: { send(m: { at: number }): Promise<void> };
  ASSETS: { fetch(r: Request | URL): Promise<Response> };
  IMAGES: Images & { input(stream: ReadableStream): unknown };
  CAMPAIGN_WAKE: Workflow;
  SITE_REFRESH_WAKE: Workflow;
};

export const cfEnv = (): CfEnv => getCloudflareContext().env as unknown as CfEnv;
