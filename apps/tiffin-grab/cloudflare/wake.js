// Plain JS (no imports) so the Worker entry and the app share it. Each wake is one Workflow instance
// with a deterministic id, so scheduling the same minute twice is a no-op.
export const wakeId = (prefix, at) => `${prefix}-${Math.ceil(at / 60_000) * 60_000}`;

const ALREADY_EXISTS = /already.{0,10}exist|instance\.already_exists/i;

/** Never throws: a lost wake is repaired by the next tick / the bootstrap on a later deploy. */
export async function createWake(workflow, prefix, at) {
  try {
    await workflow.create({ id: wakeId(prefix, at), params: { at } });
  } catch (err) {
    if (!ALREADY_EXISTS.test(String(err?.message ?? err))) console.error(`${prefix} wake create failed`, err);
  }
}
