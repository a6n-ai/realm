/**
 * One-off, idempotent cutover: moves tiffin-grab staff access from users.role to
 * per-organization member roles. Data correction, so a script, never a migration
 * (AGENTS.md "Migrations — strict rules" rule 1). Run once against prod right after deploy:
 *
 *   DATABASE_URL="$DIRECT_DATABASE_URL" tsx apps/tiffin-grab/scripts/reconcile-org-roles.ts [--dry-run] [owner@example.com ...]
 *
 * Brand org only; franchise rows are never touched. Runs in one transaction.
 */
import { sql } from "drizzle-orm";
import { getBrandOrgId } from "../lib/services/organizations.service";

type Tx = Parameters<typeof getBrandOrgId>[0] & { execute: (q: ReturnType<typeof sql>) => PromiseLike<unknown> };
type Handle = { transaction: <T>(fn: (tx: any) => Promise<T>) => Promise<T> };

export type ReconcileResult = { updated: number; inserted: number; owners: number; customersWithRows: number };

class DryRunRollback extends Error {}

const rows = (r: unknown) => r as Record<string, any>[];

export async function reconcileOrgRoles(
  db: Handle,
  opts: { ownerEmails: string[]; dryRun?: boolean },
): Promise<ReconcileResult> {
  const emails = opts.ownerEmails.map((e) => e.trim().toLowerCase()).filter(Boolean);
  let result!: ReconcileResult;
  try {
    await db.transaction(async (tx: Tx) => {
      const brand = await getBrandOrgId(tx);
      if (!brand) throw new Error("No brand organization found");

      if (emails.length) {
        const found = rows(await tx.execute(sql`select lower(email) as email from users where lower(email) in (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})`));
        const have = new Set(found.map((r) => r.email));
        const missing = emails.filter((e) => !have.has(e));
        if (missing.length) throw new Error(`Owner email(s) match no user: ${missing.join(", ")}`);
      }

      const emailFilter = emails.length ? sql`or lower(u.email) in (${sql.join(emails.map((e) => sql`${e}`), sql`, `)})` : sql``;
      const owners = rows(await tx.execute(sql`
        insert into member (organization_id, user_id, role)
        select ${brand}, u.id, 'owner' from users u
        where u.platform_role = 'super_admin' ${emailFilter}
        on conflict (organization_id, user_id) do update set role = 'owner' where member.role <> 'owner'
        returning 1`)).length;

      const updated = rows(await tx.execute(sql`
        update member m set role = u.role::text from users u
        where m.user_id = u.id and m.organization_id = ${brand}
          and m.role in ('admin', 'member') and u.role in ('admin', 'member')
          and u.status <> 'deleted' and m.role <> u.role::text
        returning 1`)).length;

      const inserted = rows(await tx.execute(sql`
        insert into member (organization_id, user_id, role)
        select ${brand}, u.id, u.role::text from users u
        where u.role in ('admin', 'member') and u.status <> 'deleted'
          and not exists (select 1 from member m where m.user_id = u.id)
        returning 1`)).length;

      const customersWithRows = Number(rows(await tx.execute(sql`
        select count(distinct u.id)::int as n from users u join member m on m.user_id = u.id
        where u.role = 'user' and m.role <> 'owner'`))[0]?.n ?? 0);

      result = { updated, inserted, owners, customersWithRows };
      if (opts.dryRun) throw new DryRunRollback();
    });
  } catch (e) {
    if (!(e instanceof DryRunRollback)) throw e;
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ownerEmails = args.filter((a) => !a.startsWith("--"));
  const { db } = await import("../db/client");
  const r = await reconcileOrgRoles(db as unknown as Handle, { ownerEmails, dryRun });
  console.log(`${dryRun ? "[dry-run, rolled back] would have: " : ""}updated=${r.updated} inserted=${r.inserted} owners=${r.owners}`);
  if (r.customersWithRows) {
    console.warn(`WARNING: ${r.customersWithRows} customer account(s) (users.role "user") hold member rows; left unchanged. Review them: a brand "admin"/"member" row grants staff access.`);
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith("reconcile-org-roles.ts")) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
