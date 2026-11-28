import { env } from "cloudflare:test";
import { orgStmt, memberStmt, TEST_ORG } from "../../../../test/helpers";

export const ME = "usr_md_me";

/** One org, one member, one inquiry for contact "Ana". Safe to call before every test. */
export async function seed(): Promise<void> {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare("delete from doc_members"),
    env.DB.prepare("delete from collab_shares"),
    env.DB.prepare("delete from collab_docs"),
    env.DB.prepare("delete from inquiry_activities"),
    env.DB.prepare("delete from inquiries"),
    orgStmt(),
    env.DB.prepare(
      "insert or ignore into users (id, name, email, role, status, created_at, updated_at) values (?, 'me@x.io', 'me@x.io', 'user', 'active', ?, ?)",
    ).bind(ME, now, now),
    memberStmt(ME),
    env.DB.prepare(
      "insert or ignore into lead_sources (id, organization_id, created_at, key, label, active) values ('lsr_md', ?, ?, 'md', 'Md', 1)",
    ).bind(TEST_ORG, now),
    env.DB.prepare(
      "insert into inquiries (id, organization_id, created_at, contact_name, source_id, stage, next_follow_up_at, created_via) values ('inq_md', ?, ?, 'Ana', 'lsr_md', 'new', ?, 'manual')",
    ).bind(TEST_ORG, now, now),
  ]);
}

export const rows = async <T>(query: string, ...args: unknown[]) =>
  (await env.DB.prepare(query)
    .bind(...args)
    .all<T>()).results;
