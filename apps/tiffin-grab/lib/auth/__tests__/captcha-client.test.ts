// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

let renders = 0;

beforeEach(() => {
  vi.resetModules();
  renders = 0;
  vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ siteKey: "k" }) })));
  window.turnstile = {
    render: (_el, opts) => {
      renders++;
      const n = renders;
      queueMicrotask(() => (opts.callback as (t: string) => void)(`t${n}`));
      return `w${n}`;
    },
    remove: () => {},
  };
  // Script tag "loads" immediately.
  vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
    queueMicrotask(() => (node as HTMLScriptElement).onload?.(new Event("load")));
    return node;
  });
});

describe("captcha warm-up", () => {
  it("hands out the pre-solved token once, then solves fresh", async () => {
    const { warmCaptcha, getCaptchaToken } = await import("../captcha-client");
    warmCaptcha();
    expect(await getCaptchaToken()).toBe("t1");
    expect(await getCaptchaToken()).toBe("t2");
    expect(renders).toBe(2);
  });

  it("does not pre-solve when told to warm only", async () => {
    const { warmCaptcha, getCaptchaToken } = await import("../captcha-client");
    warmCaptcha(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(renders).toBe(0);
    expect(await getCaptchaToken()).toBe("t1");
  });

  it("drops a pre-solved token older than its lifetime", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { warmCaptcha, getCaptchaToken } = await import("../captcha-client");
    warmCaptcha();
    vi.setSystemTime(Date.now() + 280_000);
    expect(await getCaptchaToken()).toBe("t2");
    vi.useRealTimers();
  });
});
