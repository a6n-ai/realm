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

// One-time squashes. xplorers 0000-0006 (hand-written, hand-typed `when`, no
// snapshots) became one drizzle-generated baseline on 2026-10-05, with prod's
// __drizzle_migrations rows replaced to match. The base comparison is skipped
// only while the base journal still starts at the pre-squash `when`, so every
// later change is checked normally.
// Second xplorers squash on 2026-10-19, owner-approved while the app is a pilot:
// 0000-0010 became one baseline again, and prod's __drizzle_migrations is
// recreated to match. The base journal now starts at the first baseline's `when`.
// a6n squash on 2026-11-27, owner-approved before anyone used the app: 0000-0001 became one baseline with the
// organisation tables and a required organization_id, and prod D1 was reset (tables and d1_migrations dropped) to match.
const SQUASHED_FROM = { xplorers: 1791188313266, a6n: 1795759493347 };

// Apps whose migrations live elsewhere than db/migrations. D1 apps are applied by
// `wrangler d1 migrations apply`, which tracks files by name in d1_migrations and
// ignores `when`, so filenames (not `when`) carry the ordering guarantee.
const MIGRATION_DIRS = { a6n: "drizzle" };
const D1_APPS = new Set(["a6n"]);

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
  const dir = join("apps", app, MIGRATION_DIRS[app] ?? join("db", "migrations"));
  const journalPath = join(dir, "meta", "_journal.json");
  if (!existsSync(journalPath)) continue;
  const entries = JSON.parse(readFileSync(journalPath, "utf8")).entries;

  entries.forEach((e, i) => {
    if (i > 0 && e.when <= entries[i - 1].when) errors.push(`${app}: ${e.tag} when ${e.when} is not after ${entries[i - 1].tag}`);
    if (e.when > now + 5 * 60_000) errors.push(`${app}: ${e.tag} when ${e.when} is in the future`);
  });

  if (D1_APPS.has(app)) checkD1Filenames(app, dir, entries);

  const baseJson = base ? gitShow(base, journalPath) : null;
  const parsedBase = baseJson ? JSON.parse(baseJson).entries : [];
  const squashed = parsedBase[0]?.when === SQUASHED_FROM[app];
  const baseEntries = squashed ? [] : parsedBase;
  const known = new Set(baseEntries.map((e) => e.tag));

  baseEntries.forEach((b, i) => {
    const cur = entries[i];
    if (!cur || cur.tag !== b.tag) {
      errors.push(`${app}: applied migration ${b.tag} was removed or renumbered (now ${cur?.tag ?? "missing"})`);
      return;
    }
    if (cur.when !== b.when) errors.push(`${app}: ${b.tag} when changed ${b.when} → ${cur.when}; never edit when`);
    const sqlPath = join(dir, `${b.tag}.sql`);
    if (D1_APPS.has(app) && !existsSync(sqlPath)) errors.push(`${app}: ${b.tag}.sql was deleted after it shipped`);
    const baseSql = gitShow(base, sqlPath);
    if (baseSql != null && existsSync(sqlPath) && readFileSync(sqlPath, "utf8") !== baseSql) {
      errors.push(`${app}: ${b.tag}.sql changed after it shipped; add a new migration instead`);
    }
  });

  // Without a base, skip "new entry" checks — grandfathered round `when`s
  // (e.g. an old round-number timestamp) would otherwise fail every workflow_dispatch deploy.
  if (!base) continue;

  const newest = baseEntries.length ? baseEntries[baseEntries.length - 1].when : 0;
  for (const e of entries.filter((x) => !known.has(x.tag))) {
    if (e.when <= newest) errors.push(`${app}: new ${e.tag} when ${e.when} is not after shipped ${newest}; regenerate it with drizzle-kit generate`);
    if (e.when % 1000 === 0) errors.push(`${app}: new ${e.tag} when ${e.when} looks hand-typed; let drizzle-kit generate stamp it`);
  }

  // The squash itself deletes the old files by design; every later change is checked normally.
  if (!squashed) checkFileSet(app, dir, entries.filter((x) => !known.has(x.tag)));
}

// Wrangler applies pending files in filename order and remembers them by name, so a rename or
// a name sorting before an applied one would run out of order (or twice).
function checkD1Filenames(app, dir, entries) {
  entries.forEach((e, i) => {
    if (i > 0 && e.tag <= entries[i - 1].tag) errors.push(`${app}: ${e.tag} filename does not sort after ${entries[i - 1].tag}`);
  });
  const tags = new Set(entries.map((e) => e.tag));
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql"))) {
    if (!tags.has(f.slice(0, -4))) errors.push(`${app}: ${join(dir, f)} has no journal entry`);
  }
}

// A migration ships as exactly three generated files: <tag>.sql, meta/<NNNN>_snapshot.json and its
// journal entry. Shipped files never change or disappear, and nothing else is added under migrations/.
function checkFileSet(app, dir, newEntries) {
  const expected = new Set([join(dir, "meta", "_journal.json")]);
  for (const e of newEntries) {
    const sql = join(dir, `${e.tag}.sql`);
    const snapshot = join(dir, "meta", `${e.tag.slice(0, 4)}_snapshot.json`);
    for (const f of [sql, snapshot]) {
      expected.add(f);
      if (!existsSync(f)) errors.push(`${app}: ${e.tag} is missing ${f}; commit all files drizzle-kit generate wrote`);
    }
  }
  const forkPoint = mergeBase(base);
  if (!forkPoint) return;
  const changed = execFileSync("git", ["diff", "--name-status", "--no-renames", forkPoint, "--", dir], { encoding: "utf8" });
  for (const line of changed.split("\n").filter(Boolean)) {
    const [status, file] = line.split("\t");
    if (status === "A" && !expected.has(file)) errors.push(`${app}: ${file} has no journal entry; delete it or regenerate with drizzle-kit generate`);
    else if (status !== "A" && file !== join(dir, "meta", "_journal.json")) {
      errors.push(`${app}: shipped ${file} was ${status === "D" ? "deleted" : "changed"}; shipped migrations are append-only`);
    }
  }
}

function mergeBase(ref) {
  try {
    return execFileSync("git", ["merge-base", ref, "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

if (errors.length) {
  console.error("Migration journal check failed:\n  " + errors.join("\n  "));
  process.exit(1);
}
console.log(`Migration journals OK${base ? ` (vs ${base.slice(0, 12)})` : ""}.`);
