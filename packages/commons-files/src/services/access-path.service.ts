import type { Database } from "@tiffin/commons-drizzle";
import { and, eq } from "drizzle-orm";
import { filesAccessPath } from "../schema/files";

export type RoleValue = "admin" | "member" | "user";
type ResourceType = "static" | "secured";
type Row = typeof filesAccessPath.$inferSelect;

export class AccessPathService {
  constructor(private readonly db: Database) {}

  async canRead(role: RoleValue, path: string, resourceType: ResourceType = "static"): Promise<boolean> {
    if (resourceType === "static") return true; // static assets are public-read
    return this.matches(role, path, resourceType, false);
  }

  async canWrite(role: RoleValue, path: string, resourceType: ResourceType = "static"): Promise<boolean> {
    return this.matches(role, path, resourceType, true);
  }

  private async matches(role: RoleValue, path: string, resourceType: ResourceType, needWrite: boolean): Promise<boolean> {
    const rows = (await this.db
      .select()
      .from(filesAccessPath)
      .where(eq(filesAccessPath.resourceType, resourceType))) as Row[];
    return rows.some((r) => {
      if (needWrite && !r.writeAccess) return false;
      if (r.accessName != null && r.accessName !== role) return false;
      if (r.path === path) return true;
      return r.allowSubPathAccess && path.startsWith(`${r.path}/`);
    });
  }
}
