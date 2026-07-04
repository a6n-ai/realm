import { updatableColumns } from "@realm/database";
import { type AnyPgColumn, bigint, boolean, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

export const fileResourceType = pgEnum("file_resource_type", ["static", "secured"]);
export const fileSystemNodeType = pgEnum("file_system_node_type", ["file", "directory"]);

// The ONLY table holding file rows. Directories are real rows (fileType=directory)
// so listing and cascade-delete work by parent_id, mirroring nocode-saas.
export const fileSystem = pgTable(
  "files_file_system",
  {
    ...updatableColumns("fsy"),
    resourceType: fileResourceType("resource_type").notNull().default("static"),
    name: text("name").notNull(),
    fileType: fileSystemNodeType("file_type").notNull().default("file"),
    size: bigint("size", { mode: "number" }),
    parentId: bigint("parent_id", { mode: "bigint" }).references((): AnyPgColumn => fileSystem.id, {
      onDelete: "cascade",
    }),
    path: text("path").notNull().default(""),
  },
  (t) => [
    index("idx_fs_rtype_ftype_parent").on(t.resourceType, t.fileType, t.parentId),
    index("idx_fs_rtype_ftype").on(t.resourceType, t.fileType),
    index("idx_fs_path").on(t.path),
  ],
);

export const filesAccessPath = pgTable("files_access_path", {
  ...updatableColumns("fap"),
  resourceType: fileResourceType("resource_type").notNull().default("static"),
  accessName: text("access_name"), // RoleValue: admin | member | user; null = any role
  writeAccess: boolean("write_access").notNull().default(false),
  path: text("path").notNull().default(""),
  allowSubPathAccess: boolean("allow_sub_path_access").notNull().default(true),
});

export const filesSecuredAccessKey = pgTable("files_secured_access_key", {
  ...updatableColumns("fsk"),
  path: text("path").notNull(),
  accessKey: text("access_key").notNull().unique(),
  accessTill: bigint("access_till", { mode: "number" }).notNull(), // epoch ms
  accessLimit: bigint("access_limit", { mode: "number" }),
  accessedCount: bigint("accessed_count", { mode: "number" }).notNull().default(0),
});
