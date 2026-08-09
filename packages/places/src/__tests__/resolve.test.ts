import { describe, it, expect, vi } from "vitest";
import { resolvePlace } from "../resolve";
import type { PlaceProvider, ResolvedPlace } from "../types";

const hit: ResolvedPlace = { lat: 43.7, lng: -79.3, formattedAddress: "3315 Danforth Ave" };

function provider(id: PlaceProvider["id"], result: ResolvedPlace | null): PlaceProvider {
  return { id, suggest: async () => [], resolve: async () => result };
}

describe("resolvePlace", () => {
  it("returns the first provider's hit without consulting later ones", async () => {
    const second = provider("google", hit);
    const spy = vi.spyOn(second, "resolve");
    expect(await resolvePlace([provider("aws", hit), second], { address: "x", persist: false })).toEqual(hit);
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls through to the next provider on null", async () => {
    expect(await resolvePlace([provider("aws", null), provider("google", hit)], { address: "x", persist: false })).toEqual(hit);
  });

  it("returns null when every provider misses", async () => {
    expect(await resolvePlace([provider("aws", null), provider("nominatim", null)], { address: "x", persist: false })).toBeNull();
  });

  it("does not throw when a provider throws — it falls through", async () => {
    const boom: PlaceProvider = {
      id: "aws", suggest: async () => [],
      resolve: async () => { throw new Error("network"); },
    };
    expect(await resolvePlace([boom, provider("google", hit)], { address: "x", persist: false })).toEqual(hit);
  });

  it("passes persist through to the provider unchanged", async () => {
    const p = provider("aws", hit);
    const spy = vi.spyOn(p, "resolve");
    await resolvePlace([p], { address: "x", persist: true });
    expect(spy).toHaveBeenCalledWith({ address: "x", persist: true });
  });
});
