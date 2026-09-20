"use client";
import { useState } from "react";

type Result = { ok: true; message?: string } | { error: string };

/**
 * Runs one server action for a sheet. The sheet closes on success but the toast has to outlive it,
 * and the shell unmounts a sheet as soon as onDone runs, so onDone waits for the toast to finish.
 */
export function useCommit() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const run = async (action: () => Promise<Result>, success: (r: { message?: string }) => string) => {
    setPending(true);
    setError(null);
    try {
      const r = await action();
      if ("error" in r) setError(r.error);
      else setToast(success(r));
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  };
  return { pending, error, toast, run };
}
