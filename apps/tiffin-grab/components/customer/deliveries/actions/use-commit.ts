"use client";
import { useState } from "react";

import { sanitizeClientError } from "@/lib/format/client-error";

type Result = { ok: true; message?: string } | { error: string };

/** Runs one server action for a sheet; on success hands the toast text to the shell via onDone. */
export function useCommit(onDone: (message?: string) => void) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<Result>, success: (r: { message?: string }) => string) => {
    setPending(true);
    setError(null);
    try {
      const r = await action();
      if ("error" in r) setError(sanitizeClientError(r.error));
      else onDone(success(r));
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  };
  return { pending, error, run };
}
