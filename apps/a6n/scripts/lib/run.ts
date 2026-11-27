import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const APP_DIR = fileURLToPath(new URL("../../", import.meta.url));
export const WRANGLER_CONFIG = fileURLToPath(new URL("../../wrangler.jsonc", import.meta.url));

// stdout is captured only for list calls; deploy output streams to the terminal.
export function wrangler(args: string[], capture = false): string {
  const res = spawnSync("pnpm", ["exec", "wrangler", ...args], {
    cwd: APP_DIR,
    encoding: "utf8",
    stdio: ["inherit", capture ? "pipe" : "inherit", "inherit"],
  });
  if (res.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(" ")} exited with ${res.status}`);
  return res.stdout ?? "";
}

export function build(): void {
  const res = spawnSync("pnpm", ["exec", "vite", "build"], {
    cwd: APP_DIR,
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=4096" },
  });
  if (res.status !== 0) throw new Error(`vite build exited with ${res.status}`);
}
