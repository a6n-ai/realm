import { readFile } from "node:fs/promises";
import path from "node:path";
import { cfEnv } from "@/lib/runtime/cf-env";
import { isWorkers } from "@foundry/commons/runtime/platform";

const NAMES = ["Poppins-Bold.ttf", "Poppins-Medium.ttf", "tiffin.png", "mark.png"] as const;

async function load(name: string, origin: URL): Promise<ArrayBuffer> {
  if (isWorkers()) {
    const res = await cfEnv().ASSETS.fetch(new URL(`/refer-card/${name}`, origin));
    if (!res.ok) throw new Error(`refer-card asset ${name}: ${res.status}`);
    return res.arrayBuffer();
  }
  // Standalone server.js chdirs to the app dir; next.config.ts traces public/refer-card into the build.
  return new Uint8Array(await readFile(path.join(process.cwd(), "public/refer-card", name))).buffer;
}

let nodeCache: Promise<ArrayBuffer[]> | undefined;

/** [Poppins-Bold, Poppins-Medium, tiffin.png, mark.png]. Read once on Node; per request on Workers (no module-level I/O there). */
export function referCardAssets(requestUrl: string): Promise<ArrayBuffer[]> {
  const fetchAll = () => Promise.all(NAMES.map((n) => load(n, new URL(requestUrl))));
  if (isWorkers()) return fetchAll();
  return (nodeCache ??= fetchAll().catch((e) => {
    nodeCache = undefined;
    throw e;
  }));
}
