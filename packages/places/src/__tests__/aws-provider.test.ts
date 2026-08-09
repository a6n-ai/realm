import { describe, it, expect, vi } from "vitest";
import { awsPlaceProvider } from "../aws-provider";

function fakeClient(response: unknown) {
  const sent: unknown[] = [];
  return {
    sent,
    client: { send: vi.fn(async (cmd: unknown) => { sent.push(cmd); return response; }) },
  };
}

describe("awsPlaceProvider bucket selection", () => {
  it("suggest never requests additional features or IntendedUse — Label bucket", async () => {
    const f = fakeClient({ ResultItems: [{ PlaceId: "p1", Title: "3315 Danforth Ave" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    await p.suggest("danfor");
    const input = (f.sent[0] as { input: Record<string, unknown> }).input;
    expect(input.AdditionalFeatures).toBeUndefined();
    expect(input.IntendedUse).toBeUndefined();
  });

  it("resolve with persist:false does not set IntendedUse to the storage bucket — Core bucket", async () => {
    const f = fakeClient({ ResultItems: [{ Position: [-79.3, 43.7], Address: { Label: "3315 Danforth Ave" } }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    await p.resolve({ address: "3315 Danforth Ave", persist: false });
    const input = (f.sent[0] as { input: Record<string, unknown> }).input;
    expect(input.IntendedUse).not.toBe("Storage");
  });

  it("resolve with persist:true sets IntendedUse to the storage bucket", async () => {
    const f = fakeClient({ ResultItems: [{ Position: [-79.3, 43.7], Address: { Label: "3315 Danforth Ave" } }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    await p.resolve({ address: "3315 Danforth Ave", persist: true });
    const input = (f.sent[0] as { input: Record<string, unknown> }).input;
    expect(input.IntendedUse).toBe("Storage");
  });

  it("resolve prefers GetPlace when a placeId is given, still gated on persist", async () => {
    const f = fakeClient({ PlaceId: "p1", Title: "3315 Danforth Ave", Position: [-79.3, 43.7], Address: { Label: "3315 Danforth Ave" } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    const result = await p.resolve({ placeId: "p1", address: "3315 Danforth Ave", persist: true });
    const input = (f.sent[0] as { input: Record<string, unknown> }).input;
    expect(input.PlaceId).toBe("p1");
    expect(input.IntendedUse).toBe("Storage");
    expect(result).toEqual({ lat: 43.7, lng: -79.3, formattedAddress: "3315 Danforth Ave" });
  });
});

describe("awsPlaceProvider mapping and coordinate order", () => {
  it("suggest maps PlaceId/Title to placeId/label", async () => {
    const f = fakeClient({ ResultItems: [{ PlaceId: "p1", Title: "3315 Danforth Ave" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    expect(await p.suggest("danfor")).toEqual([{ placeId: "p1", label: "3315 Danforth Ave" }]);
  });

  it("suggest returns [] when there are no results", async () => {
    const f = fakeClient({ ResultItems: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    expect(await p.suggest("nowhere")).toEqual([]);
  });

  it("suggest returns [] on a malformed response instead of throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: { send: vi.fn(async () => ({})) } as any });
    expect(await p.suggest("x")).toEqual([]);
  });

  it("suggest returns [] when the client rejects instead of throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: { send: vi.fn(async () => { throw new Error("network"); }) } as any });
    await expect(p.suggest("x")).resolves.toEqual([]);
  });

  it("resolve maps Position [lng, lat] to { lat, lng } without transposing", async () => {
    // AWS returns [-79.3872, 43.6853] for a spot in Toronto; lat must stay ~43.68, not ~-79.
    const f = fakeClient({ ResultItems: [{ Position: [-79.3872, 43.6853], Address: { Label: "Toronto, ON" } }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    const result = await p.resolve({ address: "Toronto, ON", persist: false });
    expect(result).toEqual({ lat: 43.6853, lng: -79.3872, formattedAddress: "Toronto, ON" });
  });

  it("resolve returns null when there are no results", async () => {
    const f = fakeClient({ ResultItems: [] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    expect(await p.resolve({ address: "nowhere", persist: false })).toBeNull();
  });

  it("resolve returns null on a malformed response instead of throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: { send: vi.fn(async () => ({})) } as any });
    expect(await p.resolve({ address: "x", persist: false })).toBeNull();
  });

  it("resolve returns null when the client rejects instead of throwing", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: { send: vi.fn(async () => { throw new Error("network"); }) } as any });
    await expect(p.resolve({ address: "x", persist: false })).resolves.toBeNull();
  });
});
