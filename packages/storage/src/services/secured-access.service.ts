import type { Database } from "@realm/database";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { customAlphabet } from "nanoid";
import { filesSecuredAccessKey } from "../schema/files";

const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const newKey = customAlphabet(ALPHABET, 15);

type Row = typeof filesSecuredAccessKey.$inferSelect;
export type ValidateResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "exhausted" | "path_mismatch" };

export class SecuredAccessService {
  // now() injectable so tests don't need Date.now().
  constructor(private readonly db: Database, private readonly now: () => number = () => Date.now()) {}

  async mint(path: string, opts: { ttlSeconds: number; limit?: number }): Promise<{ accessKey: string }> {
    const accessKey = newKey();
    await this.db.insert(filesSecuredAccessKey).values({
      path,
      accessKey,
      accessTill: this.now() + opts.ttlSeconds * 1000,
      accessLimit: opts.limit ?? null,
      publicId: `fsk_${accessKey}`,
    } as never);
    return { accessKey };
  }

  async validate(accessKey: string, path: string): Promise<ValidateResult> {
    const [row] = (await this.db
      .select()
      .from(filesSecuredAccessKey)
      .where(eq(filesSecuredAccessKey.accessKey, accessKey))
      .limit(1)) as Row[];
    if (!row) return { ok: false, reason: "not_found" };
    if (row.path !== path && !path.startsWith(`${row.path}/`)) return { ok: false, reason: "path_mismatch" };
    if (this.now() > row.accessTill) return { ok: false, reason: "expired" };

    // Atomic bump: only succeeds while under the limit (null = unlimited).
    const bumped = await this.db
      .update(filesSecuredAccessKey)
      .set({ accessedCount: sql`${filesSecuredAccessKey.accessedCount} + 1` })
      .where(
        and(
          eq(filesSecuredAccessKey.accessKey, accessKey),
          or(
            isNull(filesSecuredAccessKey.accessLimit),
            lt(filesSecuredAccessKey.accessedCount, filesSecuredAccessKey.accessLimit),
          ),
        ),
      )
      .returning({ id: filesSecuredAccessKey.id });
    return bumped.length ? { ok: true } : { ok: false, reason: "exhausted" };
  }
}
