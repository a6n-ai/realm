import { getCloudflareContext } from "@opennextjs/cloudflare";
import { isWorkers } from "./platform";

/**
 * Work the response must not wait for. On Workers an un-awaited promise is
 * cancelled when the response ends, so it goes to waitUntil; on Node it runs
 * detached. Failures are logged, never thrown.
 */
export function runInBackground(task: () => Promise<unknown>, label: string): void {
  const run = Promise.resolve()
    .then(task)
    .catch((err) => console.error(label, err));
  if (isWorkers()) getCloudflareContext().ctx.waitUntil(run);
}
