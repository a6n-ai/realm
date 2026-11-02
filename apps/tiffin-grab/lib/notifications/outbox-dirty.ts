import { AsyncLocalStorage } from "node:async_hooks";

// Enqueue helpers flag the db.transaction they run in; that transaction signals the outbox
// once it commits (db/client.ts). Scoped per call so concurrent requests can't signal early.
const scope = new AsyncLocalStorage<{ dirty: boolean }>();

export const markOutboxDirty = (): void => {
  const s = scope.getStore();
  if (s) s.dirty = true;
};

/** Runs `fn`; true when it enqueued anything. */
export async function trackOutbox<T>(fn: () => Promise<T>): Promise<{ value: T; dirty: boolean }> {
  const s = { dirty: false };
  const value = await scope.run(s, fn);
  return { value, dirty: s.dirty };
}
