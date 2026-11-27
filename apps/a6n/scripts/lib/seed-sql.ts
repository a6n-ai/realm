// Pure: no Node or Workers imports, so the Node script and the Workers tests both load it.
export interface SeedAdmin {
  email: string;
  name: string;
  passwordHash: string;
}

const SYSTEM_ID = "usr_system";

const SOURCES: { key: string; label: string; subs: string[] }[] = [
  { key: "cold", label: "Cold", subs: ["linkedin", "email", "call"] },
  { key: "referral", label: "Referral", subs: ["client", "partner"] },
  { key: "website", label: "Website", subs: ["contact-form"] },
];

const q = (v: string): string => `'${v.replaceAll("'", "''")}'`;
const slug = (v: string): string => v.toLowerCase().replace(/[^a-z0-9]+/g, "_");
const labelOf = (k: string): string => k.charAt(0).toUpperCase() + k.slice(1).replaceAll("-", " ");

// Id format: 3-letter prefix, "_", 12 chars of [0-9A-Za-z_-]. Derived from the email so re-applying stays idempotent.
async function emailId(prefix: string, email: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email)));
  return `${prefix}_${btoa(String.fromCharCode(...digest)).replaceAll("+", "-").replaceAll("/", "_").slice(0, 12)}`;
}

export async function seedSql(admins: SeedAdmin[], now = Date.now()): Promise<string[]> {
  const out: string[] = [];
  for (const a of admins) {
    const email = a.email.trim().toLowerCase();
    const id = await emailId("usr", email);
    out.push(
      `INSERT INTO users (id, name, email, email_verified, role, status, password_set, created_at, updated_at) VALUES (${q(id)}, ${q(a.name)}, ${q(email)}, 1, 'admin', 'active', 1, ${now}, ${now}) ON CONFLICT DO NOTHING`,
      // Selects the user by email: the row may already exist under another id.
      `INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at) SELECT ${q(await emailId("acc", email))}, id, id, 'credential', ${q(a.passwordHash)}, ${now}, ${now} FROM users WHERE email = ${q(email)} ON CONFLICT DO NOTHING`,
    );
  }
  out.push(
    `INSERT INTO users (id, name, email, email_verified, role, status, password_set, created_at, updated_at) VALUES (${q(SYSTEM_ID)}, 'System', 'system@crm.a6n.ai', 1, 'sales', 'removed', 0, ${now}, ${now}) ON CONFLICT DO NOTHING`,
  );
  for (const s of SOURCES) {
    out.push(
      `INSERT INTO lead_sources (id, created_at, key, label) VALUES (${q(`src_${s.key}`)}, ${now}, ${q(s.key)}, ${q(s.label)}) ON CONFLICT DO NOTHING`,
    );
    for (const sub of s.subs) {
      out.push(
        `INSERT INTO lead_subsources (id, created_at, source_id, key, label) VALUES (${q(`sub_${s.key}_${slug(sub)}`)}, ${now}, ${q(`src_${s.key}`)}, ${q(sub)}, ${q(labelOf(sub))}) ON CONFLICT DO NOTHING`,
      );
    }
  }
  return out;
}

// The audit row is written only if the update changed a user (changes() reads the statement just before).
export function promoteSql(email: string, by: string, now = Date.now()): string[] {
  const e = q(email.trim().toLowerCase());
  return [
    `UPDATE users SET role = 'admin', updated_at = ${now} WHERE email = ${e} AND status = 'active'`,
    `INSERT INTO audit_log (id, created_at, created_by, action, actor_id, target, data) SELECT ${q(`aud_${now}_${slug(email)}`)}, ${now}, ${q(SYSTEM_ID)}, 'role.promote', ${q(SYSTEM_ID)}, (SELECT id FROM users WHERE email = ${e}), ${q(JSON.stringify({ by }))} WHERE changes() = 1`,
  ];
}
