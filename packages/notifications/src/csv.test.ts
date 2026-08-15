import { describe, expect, it } from "vitest";
import { mapRows, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("reads headers and rows", () => {
    const p = parseCsv("email,name\na@x.com,Ada\nb@x.com,Bob\n");
    expect(p.headers).toEqual(["email", "name"]);
    expect(p.rows).toEqual([
      ["a@x.com", "Ada"],
      ["b@x.com", "Bob"],
    ]);
  });

  it("honours quoted fields containing commas", () => {
    const p = parseCsv('email,note\na@x.com,"Toronto, ON"\n');
    expect(p.rows[0]).toEqual(["a@x.com", "Toronto, ON"]);
  });

  it("honours escaped quotes and embedded newlines", () => {
    const p = parseCsv('email,note\na@x.com,"say ""hi""\nagain"\n');
    expect(p.rows[0][1]).toBe('say "hi"\nagain');
  });

  it("tolerates CRLF and a missing trailing newline", () => {
    const p = parseCsv("email\r\na@x.com");
    expect(p.rows).toEqual([["a@x.com"]]);
  });

  it("ignores a trailing blank line", () => {
    expect(parseCsv("email\na@x.com\n\n").rows).toHaveLength(1);
  });
});

describe("mapRows", () => {
  const parsed = { headers: ["Email", "Full Name", "City"], rows: [["A@X.com", "Ada", "Toronto"]] };

  it("maps the named columns and lifts the rest into vars", () => {
    const out = mapRows(parsed, { email: "Email", name: "Full Name" });
    expect(out.valid).toEqual([
      { email: "a@x.com", phone: undefined, name: "Ada", vars: { City: "Toronto" } },
    ]);
  });

  it("rejects a row with no email and no phone", () => {
    const out = mapRows({ headers: ["Email"], rows: [[""]] }, { email: "Email" });
    expect(out.valid).toHaveLength(0);
    expect(out.rejected[0]).toEqual({ row: 1, reason: "no email or phone" });
  });

  it("rejects a malformed email", () => {
    const out = mapRows({ headers: ["Email"], rows: [["not-an-email"]] }, { email: "Email" });
    expect(out.rejected[0].reason).toBe("invalid email");
  });

  it("drops a duplicate address within the same file", () => {
    const out = mapRows({ headers: ["Email"], rows: [["a@x.com"], ["A@X.COM"]] }, { email: "Email" });
    expect(out.valid).toHaveLength(1);
    expect(out.rejected[0].reason).toBe("duplicate in file");
  });

  it("normalizes a phone to digits with a leading plus", () => {
    const out = mapRows({ headers: ["Phone"], rows: [["+1 (416) 555-0134"]] }, { phone: "Phone" });
    expect(out.valid[0].phone).toBe("+14165550134");
  });
});
