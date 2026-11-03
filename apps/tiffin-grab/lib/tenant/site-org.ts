import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { organization } from "@/db/schema";

// The [org] segment of app/site/[org]/** is an organization id, or "brand" when proxy
// resolved none. Validated against the table so nothing can mint arbitrary cache keys.
// ponytail: same 60s plain-data snapshot as orgs() in proxy.ts; a new org 404s for up to a minute.
const TTL_MS = process.env.NODE_ENV === "test" ? 0 : 60_000;
let snapshot: { ids: Set<string>; at: number } | null = null;

async function orgIds(): Promise<Set<string>> {
  if (snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot.ids;
  const rows = await db.select({ id: organization.id }).from(organization);
  snapshot = { ids: new Set(rows.map((r) => r.id)), at: Date.now() };
  return snapshot.ids;
}

export async function siteOrgId(param: string): Promise<string | null> {
  if (param === "brand") return null;
  if ((await orgIds()).has(param)) return param;
  notFound();
}
