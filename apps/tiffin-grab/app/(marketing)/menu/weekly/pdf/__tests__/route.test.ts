import { NotFoundError } from "@foundry/commons";
import { describe, expect, it, vi } from "vitest";
import { GET } from "../route";

vi.mock("@/lib/menu/pdf", () => ({ renderWeeklyMenuPdf: vi.fn() }));
const { renderWeeklyMenuPdf } = await import("@/lib/menu/pdf");
const render = vi.mocked(renderWeeklyMenuPdf);

describe("GET /menu/weekly/pdf", () => {
  it("serves the pdf", async () => {
    render.mockResolvedValueOnce(new Uint8Array([1]));
    expect((await GET()).status).toBe(200);
  });

  it("is 404 when no menu is published", async () => {
    render.mockRejectedValueOnce(new NotFoundError("none"));
    expect((await GET()).status).toBe(404);
  });

  it("lets any other failure propagate", async () => {
    render.mockRejectedValueOnce(new Error("renderer crashed"));
    await expect(GET()).rejects.toThrow("renderer crashed");
  });
});
