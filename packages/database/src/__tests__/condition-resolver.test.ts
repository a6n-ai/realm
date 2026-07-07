import { describe, it, expect } from "vitest";
import { and, eq as cEq, inList, like, between, or as cOr } from "@realm/commons/model/condition";
import { pgTable, bigint, text } from "drizzle-orm/pg-core";
import { conditionToSql, columnResolver } from "../condition";

const t = pgTable("t", {
  id: bigint("id", { mode: "number" }),
  name: text("name"),
  status: text("status"),
  createdAt: bigint("created_at", { mode: "number" }),
});
const resolve = columnResolver({ name: t.name, status: t.status, createdAt: t.createdAt });

const sqlOf = (c: Parameters<typeof conditionToSql>[0]) =>
  conditionToSql(c, resolve)?.queryChunks?.length ? "sql" : undefined;

describe("conditionToSql", () => {
  it("returns undefined for undefined condition", () => {
    expect(conditionToSql(undefined, resolve)).toBeUndefined();
  });
  it("builds a filter for each operator without throwing", () => {
    expect(sqlOf(cEq("status", "won"))).toBe("sql");
    expect(sqlOf(inList("status", ["won", "lost"]))).toBe("sql");
    expect(sqlOf(like("name", "%priya%"))).toBe("sql");
    expect(sqlOf(between("createdAt", 1, 2))).toBe("sql");
  });
  it("skips empty in-lists and empty complex nodes", () => {
    expect(conditionToSql(inList("status", []), resolve)).toBeUndefined();
    expect(conditionToSql(and(), resolve)).toBeUndefined();
    expect(conditionToSql(and(inList("status", [])), resolve)).toBeUndefined();
  });
  it("combines and/or", () => {
    const c = and(cEq("status", "won"), cOr(like("name", "%a%"), like("name", "%b%")));
    expect(sqlOf(c)).toBe("sql");
  });
  it("unknown field throws via resolver", () => {
    expect(() => conditionToSql(cEq("nope", "x"), resolve)).toThrow();
  });
});
