import { NextRequest, NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { syncSessionHint } from "../session-hint";

const run = (cookie?: string) => {
  const res = NextResponse.next();
  syncSessionHint(new NextRequest("https://tiffingrab.ca/", { headers: cookie ? { cookie } : {} }), res);
  return res.headers.get("set-cookie");
};

describe("syncSessionHint", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("sets the hint when a session cookie arrives without one", () => {
    vi.stubEnv("AUTH_COOKIE_DOMAIN", "tiffingrab.ca");
    const set = run("__Secure-tiffingrab.session_token=abc");
    expect(set).toMatch(/^tg_signed_in=1;/);
    expect(set).toMatch(/Domain=tiffingrab\.ca/i);
    expect(set).not.toMatch(/HttpOnly/i);
  });

  it("clears a hint left after the session cookie is gone", () => {
    expect(run("tg_signed_in=1")).toMatch(/^tg_signed_in=;.*Max-Age=0/i);
  });

  it("writes nothing when hint and session agree", () => {
    expect(run()).toBeNull();
    expect(run("tiffingrab.session_token=abc; tg_signed_in=1")).toBeNull();
  });
});
