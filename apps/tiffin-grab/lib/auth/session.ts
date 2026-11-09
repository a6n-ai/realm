import { createGetSession } from "@foundry/auth/session";
import { auth } from "./index";

// `auth` is read per call: lib/auth/index.ts reaches this module through a cycle, so it can still be unset at load.
export const getSession = createGetSession({ auth: { api: { getSession: (ctx) => auth.api.getSession(ctx) } } });
