import { afterEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m) } }));

import { apiFetch } from "../http/api-fetch";

function res(status: number, body?: unknown, ct = "application/json"): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": ct },
  });
}

afterEach(() => {
  toastError.mockClear();
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("returns parsed json on success", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(200, { ok: 1 })));
    expect(await apiFetch("/api/x")).toEqual({ ok: 1 });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("toasts problem+json detail and throws on error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(403, { title: "Forbidden", detail: "no access", status: 403 }, "application/problem+json")));
    await expect(apiFetch("/api/x")).rejects.toThrow("no access");
    expect(toastError).toHaveBeenCalledWith("no access");
  });

  it("falls back to a status message when the body is unreadable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(500, undefined)));
    await expect(apiFetch("/api/x")).rejects.toThrow("Request failed (500)");
    expect(toastError).toHaveBeenCalledWith("Request failed (500)");
  });

  it("returns undefined on 204", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => res(204)));
    expect(await apiFetch("/api/x", { method: "POST" })).toBeUndefined();
  });
});
