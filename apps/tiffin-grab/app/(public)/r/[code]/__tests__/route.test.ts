import { describe, expect, it } from "vitest";
import { GET } from "../route";

const hit = (code: string) => GET(new Request(`https://tiffingrab.ca/r/${code}`), { params: Promise.resolve({ code }) });

describe("/r/[code]", () => {
  it("sends a code-shaped link to the friend page", async () => {
    const res = await hit("k7m2qx");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/refer/K7M2QX");
  });

  it("sends a mistyped code to the plain subscribe page", async () => {
    expect((await hit("x!")).headers.get("location")).toBe("/subscribe");
  });
});
