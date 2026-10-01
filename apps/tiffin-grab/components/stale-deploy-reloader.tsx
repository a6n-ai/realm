"use client";

import { useEffect } from "react";
import { toast } from "sonner";

// After a deploy, tabs holding the old JS bundle call server actions by an ID the
// new server no longer has → the server logs "Failed to find Server Action …" and the
// browser's call rejects with "An unexpected response was received from the server."
// Catch that and prompt a reload instead of leaving the user with a dead click.
export function isStaleActionError(message: string): boolean {
  return /Failed to find Server Action|Server Action.*(not found|older or newer deployment)|unexpected response was received from the server/i.test(message);
}

let reloadPrompted = false;

/** Shows the one "new version, reload" toast. Call it from a catch that would otherwise swallow the error. */
export function promptReloadIfStale(error: unknown): boolean {
  const message = String((error as { message?: string })?.message ?? error ?? "");
  if (!isStaleActionError(message)) return false;
  if (!reloadPrompted) {
    reloadPrompted = true;
    toast.error("A new version of the app is available.", {
      description: "Reload to continue.",
      duration: Infinity,
      action: { label: "Reload", onClick: () => window.location.reload() },
    });
  }
  return true;
}

const hasActionHeader = (init?: RequestInit) => {
  const h = init?.headers;
  if (!h) return false;
  if (h instanceof Headers) return h.has("next-action");
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === "next-action");
  return Object.keys(h).some((k) => k.toLowerCase() === "next-action");
};

/** A server-action response for an action this build doesn't have (Next sets this header). */
export function isStaleActionResponse(init: RequestInit | undefined, res: Pick<Response, "headers">): boolean {
  return hasActionHeader(init) && res.headers.get("x-nextjs-action-not-found") === "1";
}

export function StaleDeployReloader() {
  useEffect(() => {
    const maybeToast = (message: string) => void promptReloadIfStale(message);
    // Every server action goes through fetch, so this catches a stale tab even when the
    // calling button catches the error and shows its own message.
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const res = await originalFetch(input, init);
      if (isStaleActionResponse(init, res)) maybeToast("Failed to find Server Action");
      return res;
    };
    const onRejection = (e: PromiseRejectionEvent) =>
      maybeToast(String((e.reason as { message?: string })?.message ?? e.reason ?? ""));
    const onError = (e: ErrorEvent) => maybeToast(String(e.message ?? ""));

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.fetch = originalFetch;
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
