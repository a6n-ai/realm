import { describe, expect, it } from "vitest";
import { json } from "./response";

describe("json()", () => {
  it("drops bigint properties and does not throw", async () => {
    const body = { id: 123n, publicId: "ord_abc", createdBy: 9n, total: "10.00" };
    let res: Response;
    expect(() => { res = json(body); }).not.toThrow();
    const parsed = await res!.json();
    expect(parsed).toEqual({ publicId: "ord_abc", total: "10.00" });
    expect(parsed).not.toHaveProperty("id");
    expect(parsed).not.toHaveProperty("createdBy");
  });

  it("preserves non-bigint fields and status", async () => {
    const res = json({ name: "tiffin", count: 3 }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ name: "tiffin", count: 3 });
  });

  it("handles nested bigint values", async () => {
    const body = { meta: { internalId: 99n }, label: "ok" };
    const parsed = await json(body).json();
    expect(parsed).toEqual({ meta: {}, label: "ok" });
  });
});
