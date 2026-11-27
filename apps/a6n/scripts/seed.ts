// Writes SQL files only; never touches a database. Seed: --admin <email>:<name> (repeatable). Promote: --promote <email> --by <email>.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { hashPassword } from "better-auth/crypto";
import { promoteSql, seedSql, type SeedAdmin } from "./lib/seed-sql.ts";

const args = process.argv.slice(2);
const values = (flag: string): string[] =>
  args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const out = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));

function promptHidden(label: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(label);
    const stdin = process.stdin;
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(buf);
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f") buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on("data", onData);
  });
}

const promote = values("--promote")[0];
if (promote) {
  const by = values("--by")[0];
  if (!by) throw new Error("--promote needs --by <email>");
  writeFileSync(out(".promote.sql"), promoteSql(promote, by).join(";\n") + ";\n");
  console.log("wrote scripts/.promote.sql");
} else {
  const admins: SeedAdmin[] = [];
  for (const spec of values("--admin")) {
    const at = spec.indexOf(":");
    if (at < 1) throw new Error(`--admin expects <email>:<name>, got ${spec}`);
    const email = spec.slice(0, at);
    const password = await promptHidden(`Password for ${email}: `);
    if (password.length < 12) throw new Error("password must be at least 12 characters");
    admins.push({ email, name: spec.slice(at + 1), passwordHash: await hashPassword(password) });
  }
  writeFileSync(out(".seed.sql"), (await seedSql(admins)).join(";\n") + ";\n");
  console.log(`wrote scripts/.seed.sql (${admins.length} admins)`);
}
