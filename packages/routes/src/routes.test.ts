import { AuthError } from "@realm/commons";
import { describe, expect, it } from "vitest";
import { handler } from "./routes";

describe("handler", () => {
  it("passes a returned Response through untouched", async () => {
    const GET = handler(async () => new Response("ok", { status: 200 }));
    expect((await GET()).status).toBe(200);
  });

  it("maps a thrown AppError to problem+json", async () => {
    const GET = handler(async () => {
      throw new AuthError();
    });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.headers.get("content-type")).toBe("application/problem+json");
    expect((await res.json()).detail).toBe("Unauthorized");
  });
});
