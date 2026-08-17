import { afterEach, describe, expect, it } from "vitest";
import { assertLocalDb, isLocalDb } from "../is-local-db";

const ORIGINAL = process.env.DATABASE_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = ORIGINAL;
});

describe("isLocalDb", () => {
  it("accepts the loopback hosts and nothing else", () => {
    expect(isLocalDb("postgres://u@localhost:5432/tiffin")).toBe(true);
    expect(isLocalDb("postgres://u@127.0.0.1:5432/tiffin")).toBe(true);
    expect(isLocalDb("postgres://u:pw@[::1]:5432/tiffin")).toBe(true);

    expect(isLocalDb("postgres://u:pw@tiffin.abc123.us-east-1.rds.amazonaws.com:5432/tiffin")).toBe(false);
    expect(isLocalDb("postgres://u@10.0.1.5:5432/tiffin")).toBe(false);
  });

  it("treats an unparseable url as remote, never local", () => {
    // Fail closed: a malformed URL must not be read as "probably my laptop".
    expect(isLocalDb("not a url")).toBe(false);
    expect(isLocalDb("")).toBe(false);
  });

  it("is not fooled by a remote host that merely contains a loopback name", () => {
    expect(isLocalDb("postgres://u:pw@localhost.evil.example.com:5432/tiffin")).toBe(false);
    expect(isLocalDb("postgres://u:pw@notlocalhost:5432/tiffin")).toBe(false);
  });
});

describe("assertLocalDb", () => {
  it("returns the url when local", () => {
    process.env.DATABASE_URL = "postgres://u@localhost:5432/tiffin";
    expect(assertLocalDb("seed-x")).toBe("postgres://u@localhost:5432/tiffin");
  });

  it("throws and names the script and the host when remote", () => {
    process.env.DATABASE_URL = "postgres://u:pw@tiffin.abc123.us-east-1.rds.amazonaws.com:5432/tiffin";
    expect(() => assertLocalDb("seed-x")).toThrow(/seed-x refuses to run/);
    expect(() => assertLocalDb("seed-x")).toThrow(/rds\.amazonaws\.com/);
  });

  it("throws on an unparseable url rather than defaulting to local", () => {
    process.env.DATABASE_URL = "://broken";
    expect(() => assertLocalDb("seed-x")).toThrow(/unparseable DATABASE_URL/);
  });
});
