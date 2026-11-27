import { AppError } from "@foundry/commons/errors";
import { createGuard } from "@foundry/commons/guard";
import { getRequestHeaders, setResponseStatus } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { type Actor, requireActor, requirePlatformAdmin } from "./auth/actor";
import type { Permission } from "./auth/permissions";

type Need = { permission?: Permission; write?: boolean };
type Admin = { userId: string; name: string };

// A known error keeps its status and message, anything else is a 500 with no detail for the browser.
const shared = {
  setStatus: setResponseStatus,
  onFailure: (_sent: Error, status: number, cause: unknown) => {
    if (status >= 500) console.error("internal error", cause);
  },
};

const guard = createGuard<Need, Actor>({ actor: (need) => requireActor(env, getRequestHeaders(), need), ...shared });

// A read the actor may not make is null, and the page renders DeniedState with status 200.
export const read = <T>(permission: Permission, fn: (actor: Actor) => Promise<T>) => guard.read({ permission }, fn);
// Any member of the active organisation.
export const readAny = <T>(fn: (actor: Actor) => Promise<T>) => guard.read({}, fn);
export const refusing = guard.refuse;
export const { fail } = guard;

export const WRITE = (permission: Permission) => ({ permission, write: true });

// Not a super admin: null, and the page shows nothing about organisations.
const admin = createGuard<{ write: boolean }, Admin | null>({
  actor: async (need) => {
    try {
      return await requirePlatformAdmin(env, getRequestHeaders(), need);
    } catch (err) {
      if (err instanceof AppError && err.status === 404) return null;
      throw err;
    }
  },
  ...shared,
});
export const platform = <T>(write: boolean, fn: (admin: Admin) => Promise<T>) => admin.run({ write }, async (a) => (a ? fn(a) : null));
