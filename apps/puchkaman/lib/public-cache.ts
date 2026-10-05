import { cookies } from "next/headers";

/**
 * Process-memory cache for what anonymous visitors see on the public site.
 *
 * Why: the database is Neon, which bills while its compute is awake and sleeps
 * after 5 idle minutes. Crawlers walk the menu one product page at a time,
 * every few minutes, and each visit re-read products, catalog, settings and
 * location from Postgres, so the compute never slept. Product prices and stock
 * only change when admin pulls from Clover (Clover sends no product webhooks),
 * so between writes these reads always return the same thing.
 *
 * Why not unstable_cache / "use cache": the loaders resolve the franchise from
 * the request (session, proxy header, franchise cookie), which Next forbids
 * inside a cache scope. Memoizing the page-level result keyed by the org the
 * proxy resolved keeps the services untouched. One web container runs, so
 * module memory is shared by every request.
 *
 * Correctness:
 * - Signed-in requests bypass the cache. Staff can switch org via the session,
 *   which would not match the key, and signed-in traffic is real traffic anyway.
 * - Every audited write (create/update/delete through the shared session
 *   services), the Clover sync routes and integrations saves call
 *   clearPublicCache(), so the next visit reads fresh data.
 * - Cart, checkout and payment never use this; they always price live.
 * - MAX_AGE_MS is a safety net for a write path that forgot to clear.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

type Entry = { at: number; value: Promise<unknown> };
const g = globalThis as typeof globalThis & { __puchkamanPublicCache?: Map<string, Entry> };
const store = (g.__puchkamanPublicCache ??= new Map<string, Entry>());

async function hasSession(): Promise<boolean> {
  try {
    const jar = await cookies();
    return SESSION_COOKIES.some((name) => jar.has(name));
  } catch {
    // No request scope (script/test): nothing to share, compute live.
    return true;
  }
}

export async function publicCached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (await hasSession()) return load();
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < MAX_AGE_MS) return hit.value as Promise<T>;
  const value = load();
  store.set(key, { at: Date.now(), value });
  // A failed load must not be served to the next visitor.
  value.catch(() => {
    if (store.get(key)?.value === value) store.delete(key);
  });
  return value;
}

export function clearPublicCache(): void {
  store.clear();
}
