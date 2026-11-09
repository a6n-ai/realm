import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { AsyncLocalStorage } from "node:async_hooks";
import { isWorkers } from "@foundry/commons/runtime/platform";
import * as schema from "./schema";
import { isProduction } from "@/lib/runtime/env";

type Pg = ReturnType<typeof postgres>;
type Db = ReturnType<typeof drizzle<typeof schema>>;

const onWorkers = isWorkers();

if (!onWorkers && !process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* file absent — real env is expected to provide DATABASE_URL */
  }
}

const pending = new AsyncLocalStorage<Set<() => Promise<void>>>();

/** Queues `hook` to run once the enclosing db.transaction commits (once per transaction, however often queued). No-op outside one. */
export function onCommit(hook: () => Promise<void>): void {
  pending.getStore()?.add(hook);
}

// Hooks run after the transaction commits, never inside it. A rollback throws past them.
function runAfterCommit(d: Db): Db {
  const raw = d.transaction.bind(d) as (fn: never, cfg?: never) => Promise<unknown>;
  d.transaction = (async (fn: never, cfg?: never) => {
    const hooks = new Set<() => Promise<void>>();
    const value = await pending.run(hooks, () => raw(fn, cfg));
    for (const hook of hooks) {
      // Committed work must never fail on a hook; the per-minute tick is the backstop for the outbox wake-up.
      try {
        await hook();
      } catch (err) {
        console.error("after-commit hook failed", err);
      }
    }
    return value;
  }) as Db["transaction"];
  return d;
}

function nodeDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const globalForDb = globalThis as typeof globalThis & { __tiffinGrabPg?: Pg };
  const client =
    globalForDb.__tiffinGrabPg ??
    postgres(connectionString, {
      max: isProduction() ? 10 : 4,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      prepare: false,
    });
  if (!isProduction()) globalForDb.__tiffinGrabPg = client;
  return runAfterCommit(drizzle(client, { schema }));
}

// Workers forbid reusing a socket across requests, so each request gets its own
// small client, keyed on its ExecutionContext. Hyperdrive does the real pooling; a
// few connections let a page's parallel queries actually run in parallel.
const perRequest = new WeakMap<object, Db>();

function requestDb(): Db {
  const { env, ctx } = getCloudflareContext();
  let d = perRequest.get(ctx);
  if (!d) {
    const hd = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    if (!hd) throw new Error("HYPERDRIVE binding missing");
    d = runAfterCommit(drizzle(postgres(hd.connectionString, { max: 5, prepare: false }), { schema }));
    perRequest.set(ctx, d);
  }
  return d;
}

// Node keeps the plain singleton (tests spy on it). On Workers each property
// access resolves the current request's client.
export const db: Db = onWorkers
  ? new Proxy({} as Db, {
      get(_t, prop) {
        const target = requestDb();
        const v = Reflect.get(target, prop, target);
        return typeof v === "function" ? v.bind(target) : v;
      },
    })
  : nodeDb();
export { schema };
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
