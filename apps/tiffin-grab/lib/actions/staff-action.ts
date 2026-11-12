import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { ValidationError } from "@foundry/commons";
import { requireAdmin, requirePermission, requireStaff } from "@/lib/auth/guards";
import { invalidateCatalogSnapshot } from "@/lib/catalog/load";
import { runAction, type ActionResult } from "./action-result";

export type Guard = "staff" | "admin" | Parameters<typeof requirePermission>[0];

/** A page to refresh after success; a tuple refreshes a layout and everything under it. */
export type RevalidateTarget = string | readonly [path: string, type: "layout" | "page"];

export type StaffActionOpts = {
  guard: Guard;
  revalidate?: readonly RevalidateTarget[];
  /** The write changes data the public catalog snapshot caches (plans, sizes, settings the wizard reads). */
  catalog?: boolean;
};

/** Parses untrusted action input; a bad field becomes a ValidationError the form can show. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (r.success) return r.data;
  const issue = r.error.issues[0];
  const field = issue?.path.join(".");
  throw new ValidationError(field ? `${field}: ${issue!.message}` : (issue?.message ?? "Invalid input"));
}

export function guard(g: Guard): Promise<void> {
  if (g === "staff") return requireStaff();
  if (g === "admin") return requireAdmin();
  return requirePermission(g);
}

export function revalidateAll(targets: readonly RevalidateTarget[] = []): void {
  for (const t of targets) {
    if (typeof t === "string") revalidatePath(t);
    else revalidatePath(t[0], t[1]);
  }
}

/**
 * Every dashboard server action: guard first, the body under `runAction` (an expected refusal is
 * returned, never thrown, because production redacts thrown action errors), the catalog snapshot
 * cleared inside the action so a failed bust is reported, then the named pages refreshed on success.
 */
export async function staffAction<T extends Record<string, unknown>>(
  opts: StaffActionOpts,
  fn: () => Promise<T>,
): Promise<ActionResult<T>>;
export async function staffAction(
  opts: StaffActionOpts,
  fn: () => Promise<void | string>,
): Promise<ActionResult>;
export async function staffAction(
  opts: StaffActionOpts,
  fn: () => Promise<void | string | Record<string, unknown>>,
): Promise<ActionResult<Record<string, unknown>>> {
  const res = await runAction(async () => {
    await guard(opts.guard);
    const out = await fn();
    if (opts.catalog) await invalidateCatalogSnapshot();
    return out as Record<string, unknown>;
  });
  if ("ok" in res) revalidateAll(opts.revalidate);
  return res;
}
