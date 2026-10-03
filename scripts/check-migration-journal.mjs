#!/usr/bin/env node
// Guards drizzle migration history against hand-edited `when` values.
//
// drizzle's migrator applies a journal entry only if its `when` is later than
// the newest created_at already recorded in prod, and says "applied
// successfully" either way — so a rewritten or back-dated `when` silently skips
// a migration on deploy. `when` must only ever be written by `drizzle-kit
// generate`. Against a base ref (the previous main), this fails when:
//   - an existing entry changed (tag, `when`, or its SQL file), or disappeared;
//   - a new entry is not later than every existing one, or is in the future;
//   - a `when` is a whole second (drizzle stamps Date.now(); round = hand-typed).
//
// Usage: node scripts/check-migration-journal.mjs [baseRef]
// Without a baseRef (or an all-zero one) only ordering/sanity is checked.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const base = process.argv[2] && !/^0+$/.test(process.argv[2]) ? process.argv[2] : null;
const now = Date.now();
const errors = [];

function gitShow(ref, path) {
  try {
    return execFileSync("git", ["show", `${ref}:${path}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

for (const app of readdirSync("apps")) {
  const dir = join("apps", app, "db", "migrations");
  const journalPath = join(dir, "meta", "_journal.json");
  if (!existsSync(journalPath)) continue;
  const entries = JSON.parse(readFileSync(journalPath, "utf8")).entries;

  entries.forEach((e, i) => {
    if (i > 0 && e.when <= entries[i - 1].when) errors.push(`${app}: ${e.tag} when ${e.when} is not after ${entries[i - 1].tag}`);
    if (e.when > now + 5 * 60_000) errors.push(`${app}: ${e.tag} when ${e.when} is in the future`);
  });

  const baseJson = base ? gitShow(base, journalPath) : null;
  const baseEntries = baseJson ? JSON.parse(baseJson).entries : [];
  const known = new Set(baseEntries.map((e) => e.tag));

  baseEntries.forEach((b, i) => {
    const cur = entries[i];
    if (!cur || cur.tag !== b.tag) {
      errors.push(`${app}: applied migration ${b.tag} was removed or renumbered (now ${cur?.tag ?? "missing"})`);
      return;
    }
    if (cur.when !== b.when) errors.push(`${app}: ${b.tag} when changed ${b.when} → ${cur.when}; never edit when`);
    const sqlPath = join(dir, `${b.tag}.sql`);
    const baseSql = gitShow(base, sqlPath);
    if (baseSql != null && existsSync(sqlPath) && readFileSync(sqlPath, "utf8") !== baseSql) {
      errors.push(`${app}: ${b.tag}.sql changed after it shipped; add a new migration instead`);
    }
  });

  const newest = baseEntries.length ? baseEntries[baseEntries.length - 1].when : 0;
  for (const e of entries.filter((x) => !known.has(x.tag))) {
    if (e.when <= newest) errors.push(`${app}: new ${e.tag} when ${e.when} is not after shipped ${newest}; regenerate it with drizzle-kit generate`);
    if (e.when % 1000 === 0) errors.push(`${app}: new ${e.tag} when ${e.when} looks hand-typed; let drizzle-kit generate stamp it`);
  }
}

if (errors.length) {
  console.error("Migration journal check failed:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`Migration journals OK${base ? ` (vs ${base.slice(0, 12)})` : ""}.`);
