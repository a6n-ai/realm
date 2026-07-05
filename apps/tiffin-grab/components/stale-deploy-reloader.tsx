"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

// After a deploy, tabs holding the old JS bundle call server actions by an ID the
// new server no longer has → Next throws "Failed to find Server Action …". Catch
// that globally and prompt a reload instead of leaving the user with a dead click.
export function isStaleActionError(message: string): boolean {
  return /Failed to find Server Action|Server Action.*(not found|older or newer deployment)/i.test(message);
}

export function StaleDeployReloader() {
  const shown = useRef(false);

  useEffect(() => {
    function maybeToast(message: string) {
      if (shown.current || !isStaleActionError(message)) return;
      shown.current = true;
      toast.error("A new version of the app is available.", {
        description: "Reload to continue.",
        duration: Infinity,
        action: { label: "Reload", onClick: () => window.location.reload() },
      });
    }
    const onRejection = (e: PromiseRejectionEvent) =>
      maybeToast(String((e.reason as { message?: string })?.message ?? e.reason ?? ""));
    const onError = (e: ErrorEvent) => maybeToast(String(e.message ?? ""));

    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  return null;
}
