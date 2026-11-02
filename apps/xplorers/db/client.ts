import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isWorkers } from "@/lib/runtime/platform";
import * as schema from "./schema";

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

function nodeDb(): Db {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const globalForDb = globalThis as typeof globalThis & { __xplorersPg?: Pg };
  const client =
    globalForDb.__xplorersPg ??
    postgres(connectionString, {
      max: process.env.NODE_ENV === "production" ? 10 : 4,
      idle_timeout: 20,
      max_lifetime: 60 * 30,
      prepare: false,
    });
  if (process.env.NODE_ENV !== "production") globalForDb.__xplorersPg = client;
  return drizzle(client, { schema });
}

// Workers forbid reusing a socket across requests, so each request gets its own
// one-connection client, keyed on its ExecutionContext. Hyperdrive does the pooling.
const perRequest = new WeakMap<object, Db>();

function requestDb(): Db {
  const { env, ctx } = getCloudflareContext();
  let d = perRequest.get(ctx);
  if (!d) {
    const hd = (env as { HYPERDRIVE?: { connectionString: string } }).HYPERDRIVE;
    if (!hd) throw new Error("HYPERDRIVE binding missing");
    d = drizzle(postgres(hd.connectionString, { max: 1, prepare: false }), { schema });
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
