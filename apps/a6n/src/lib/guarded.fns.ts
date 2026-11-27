import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { ConsoleError, requireActor, toResponseError } from "./auth/actor";
import type { Permission } from "./auth/permissions";

// A read the actor may not make is null, and the page renders DeniedState with status 200.
export async function read<T>(permission: Permission, run: (actor: Awaited<ReturnType<typeof requireActor>>) => Promise<T>): Promise<T | null> {
  try {
    return await run(await requireActor(env, getRequestHeaders(), { permission }));
  } catch (err) {
    if (err instanceof ConsoleError && err.status === 403) return null;
    return toResponseError(err);
  }
}

export const WRITE = (permission: Permission) => ({ permission, write: true });
