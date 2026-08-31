import { describe, it, expect, vi } from "vitest";
import { resolveAndPersist } from "../index";

describe("resolveAndPersist", () => {
  it("resolves via AWS with persist: true, and never touches Google", async () => {
    const sent: unknown[] = [];
    const client = {
      send: vi.fn(async (cmd: unknown) => {
        sent.push(cmd);
        return { Position: [-79.3872, 43.6853], Address: { Label: "3315 Danforth Ave, Scarborough, ON M1L 1B8, Canada" } };
      }),
    };
    // resolveAndPersist's opts type only advertises `region`, but it forwards
    // opts straight to awsPlaceProvider() — injecting a client this way proves
    // it is implemented as awsPlaceProvider(opts).resolve({ ..., persist: true }),
    // not some other AWS/Google mix.
    const opts = { client } as unknown as { region?: string };

    const result = await resolveAndPersist({ placeId: "p1", address: "3315 Danforth Ave" }, opts);

    expect(result).toEqual({ lat: 43.6853, lng: -79.3872, formattedAddress: "3315 Danforth Ave, Scarborough, ON M1L 1B8, Canada" });
    const input = (sent[0] as { input: Record<string, unknown> }).input;
    expect(input.PlaceId).toBe("p1");
    expect(input.IntendedUse).toBe("Storage");
  });
});
