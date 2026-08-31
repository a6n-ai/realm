import { describe, it, expect, vi } from "vitest";
import { AutocompleteCommand } from "@aws-sdk/client-geo-places";
import { awsPlaceProvider } from "../aws-provider";
import type { GeoPlacesSendClient } from "../aws-provider";
import { runProviderConformance, UPSTREAM_FAILURE_QUERY, UPSTREAM_SUCCESS_QUERY } from "./provider-conformance";

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
  it("suggest prefers Address.Label over Title", async () => {
    // Real AWS shape: Title is ordered least-specific first, which reads badly
    // in a dropdown; Address.Label is the customer-facing string and arrives
    // in the same (cheap) response.
    const f = fakeClient({
      ResultItems: [
        {
          PlaceId: "p1",
          Title: "Canada, ON, M1L 1B8, Toronto, Oakridge, 3315 Danforth Ave",
          Address: { Label: "3315 Danforth Ave, Scarborough, ON M1L 1B8, Canada" },
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    expect(await p.suggest("danfor")).toEqual([
      { placeId: "p1", label: "3315 Danforth Ave, Scarborough, ON M1L 1B8, Canada" },
    ]);
  });

  it("suggest falls back to Title when Address is absent", async () => {
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

  it("resolve populates structured address fields from Address", async () => {
    const f = fakeClient({
      ResultItems: [
        {
          Position: [-79.3872, 43.6853],
          Address: {
            Label: "3315 Danforth Ave, Scarborough, ON M1L 1B8, Canada",
            AddressNumber: "3315",
            Street: "Danforth Ave",
            Locality: "Scarborough",
            Region: { Code: "ON", Name: "Ontario" },
            PostalCode: "M1L 1B8",
          },
        },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    const result = await p.resolve({ address: "3315 Danforth Ave", persist: false });
    expect(result).toEqual({
      lat: 43.6853,
      lng: -79.3872,
      formattedAddress: "3315 Danforth Ave, Scarborough, ON M1L 1B8, Canada",
      addressLine: "3315 Danforth Ave",
      city: "Scarborough",
      province: "ON",
      postalCode: "M1L 1B8",
    });
  });

  it("resolve prefers Region.Name when Region.Code is absent", async () => {
    const f = fakeClient({
      ResultItems: [
        { Position: [-79.3872, 43.6853], Address: { Label: "Toronto, ON", Region: { Name: "Ontario" } } },
      ],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    const result = await p.resolve({ address: "Toronto, ON", persist: false });
    expect(result?.province).toBe("Ontario");
  });

  it("resolve omits addressLine entirely when AddressNumber or Street is missing, rather than emitting a partial string", async () => {
    const f = fakeClient({
      ResultItems: [{ Position: [-79.3872, 43.6853], Address: { Label: "Danforth Ave, Scarborough, ON", Street: "Danforth Ave" } }],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    const result = await p.resolve({ address: "Danforth Ave", persist: false });
    expect(result?.addressLine).toBeUndefined();
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

  it("suggest never calls the client for a whitespace-only query — the empty-input guard", async () => {
    const f = fakeClient({ ResultItems: [{ PlaceId: "p1", Title: "should not be reached" }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    expect(await p.suggest("   ")).toEqual([]);
    expect(f.client.send).not.toHaveBeenCalled();
  });

  it("resolve never calls the client for a whitespace-only address with no placeId — the empty-input guard", async () => {
    const f = fakeClient({ ResultItems: [{ Position: [-79.3, 43.7], Address: { Label: "should not be reached" } }] });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = awsPlaceProvider({ client: f.client as any });
    expect(await p.resolve({ address: "   ", persist: false })).toBeNull();
    expect(f.client.send).not.toHaveBeenCalled();
  });
});

let conformanceSendSpy: ReturnType<typeof vi.fn>;

function makeConformanceProvider() {
  conformanceSendSpy = vi.fn(async (cmd: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const queryText: string | undefined = (cmd as any).input?.QueryText;
    if (queryText === UPSTREAM_FAILURE_QUERY) throw new Error("network down");
    if (cmd instanceof AutocompleteCommand) {
      return { ResultItems: [{ PlaceId: "p1", Title: UPSTREAM_SUCCESS_QUERY }] };
    }
    return { ResultItems: [{ Position: [-79.3872, 43.6853], Address: { Label: UPSTREAM_SUCCESS_QUERY } }] };
  });
  const client = { send: conformanceSendSpy } as unknown as GeoPlacesSendClient;
  return awsPlaceProvider({ client });
}

runProviderConformance("aws", makeConformanceProvider, () => conformanceSendSpy.mock.calls.length);
