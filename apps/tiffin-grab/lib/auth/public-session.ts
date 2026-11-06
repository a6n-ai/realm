"use client";

import { useEffect, useSyncExternalStore } from "react";
import { authClient } from "./client";
import { SESSION_HINT_COOKIE } from "./cookie-prefix";

// Public-page stand-in for useSession(). That hook fetches /api/auth/get-session on mount and on
// every window focus, for every visitor, signed in or not (~480 ms Worker CPU a call). This one asks
// only when the hint cookie says a session cookie exists, once per page for all callers.
type State = { data: typeof authClient.$Infer.Session | null; isPending: boolean };

const PENDING: State = { data: null, isPending: true };
const HINT = new RegExp(`(?:^|;\\s*)${SESSION_HINT_COOKIE}=1(?:;|$)`);
let state: State = PENDING;
let inflight = false;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const l of listeners) l();
}

function load(force: boolean) {
  if (!HINT.test(document.cookie)) {
    if (state.isPending || state.data) set({ data: null, isPending: false });
    return;
  }
  if (inflight || (!force && !state.isPending)) return;
  inflight = true;
  authClient
    .getSession()
    .then(({ data }) => set({ data: data ?? null, isPending: false }), () => set({ data: null, isPending: false }))
    .finally(() => { inflight = false; });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};
const refetch = () => load(true);

export function usePublicSession() {
  const s = useSyncExternalStore(subscribe, () => state, () => PENDING);
  useEffect(() => load(false), []);
  return { data: s.data, isPending: s.isPending, refetch };
}
