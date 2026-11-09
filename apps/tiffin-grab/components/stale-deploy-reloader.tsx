"use client";

import { useEffect } from "react";
import { promptReloadIfStale, isStaleActionResponse } from "@foundry/ui/stale-deploy";

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
