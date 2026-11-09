import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const workers = vi.hoisted(() => ({ on: false }));
const assetsFetch = vi.hoisted(() => vi.fn());

// "\u002f" keeps these mock paths from matching vitest.config TOUCHES_DB: everything touching a DB is mocked here.
vi.mock("@foundry/commons/runtime/platform", () => ({ isWorkers: () => workers.on }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env: { ASSETS: { fetch: assetsFetch } } }) }));
vi.mock("@/lib/services\u002freferrals\u002eservice", () => ({ findReferrerByCode: async () => ({ firstName: "Asha" }) }));
vi.mock("@/lib/services\u002fapp-settings\u002eservice", () => ({
  getAppSettings: async () => ({ currency: "CAD" }),
  getReferralSettings: async () => ({}),
}));
vi.mock("@/lib/services\u002fwallet\u002eservice", () => ({ walletService: { activeRate: async () => null } }));
vi.mock("@/lib/referrals/share", () => ({ friendOfferParts: () => ({ lead: "Get", big: "$15", small: "off your first order" }) }));

import { GET } from "../route";

const pub = (name: string) => readFileSync(path.join(process.cwd(), "public/refer-card", name));
const req = () => new Request("https://app.tiffingrab.ca/api/refer-card/ABCD2345");
const call = () => GET(req(), { params: Promise.resolve({ code: "ABCD2345" }) });

beforeEach(() => {
  assetsFetch.mockReset();
});

describe("refer card", () => {
  it("renders 200 image/png from the public dir on Node", async () => {
    workers.on = false;
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("renders 200 image/png from the ASSETS binding on Workers", async () => {
    workers.on = true;
    assetsFetch.mockImplementation(async (u: URL) => new Response(pub(path.basename(u.pathname))));
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/png");
    expect(assetsFetch.mock.calls.map((c) => (c[0] as URL).pathname).sort()).toEqual(
      ["/refer-card/Poppins-Bold.ttf", "/refer-card/Poppins-Medium.ttf", "/refer-card/mark.png", "/refer-card/tiffin.png"],
    );
  });
});
