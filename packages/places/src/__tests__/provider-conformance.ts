import { describe, it, expect } from "vitest";
import type { PlaceProvider } from "../types";

/** Sentinel the provider's stubbed upstream must fail (throw or non-ok) for. */
export const UPSTREAM_FAILURE_QUERY = "conformance-upstream-failure";
/** Sentinel the provider's stubbed upstream must return a valid hit for. */
export const UPSTREAM_SUCCESS_QUERY = "3315 Danforth Ave";

/**
 * The contract every PlaceProvider owes, independent of vendor. Each caller's
 * makeProvider() must wire the provider to a stub upstream (fetch/client) that:
 *  - fails (throws or returns a non-ok/malformed response) for UPSTREAM_FAILURE_QUERY
 *  - returns a valid hit for UPSTREAM_SUCCESS_QUERY
 *
 * An interface with two implementations where only one is tested is
 * indirection, not an interface — this is called from both aws-provider.test.ts
 * and google-provider.test.ts.
 */
export function runProviderConformance(name: string, makeProvider: () => PlaceProvider): void {
  describe(`${name} provider conformance`, () => {
    it("suggest() returns [] (never throws) when the upstream fails", async () => {
      const provider = makeProvider();
      await expect(provider.suggest(UPSTREAM_FAILURE_QUERY)).resolves.toEqual([]);
    });

    it("suggest() returns [] for an empty query", async () => {
      const provider = makeProvider();
      await expect(provider.suggest("")).resolves.toEqual([]);
    });

    it("resolve() returns null (never throws) when the upstream fails", async () => {
      const provider = makeProvider();
      await expect(
        provider.resolve({ address: UPSTREAM_FAILURE_QUERY, persist: false }),
      ).resolves.toBeNull();
    });

    it("resolve() returns null for an empty address with no placeId", async () => {
      const provider = makeProvider();
      await expect(provider.resolve({ address: "", persist: false })).resolves.toBeNull();
    });

    it("a successful resolve() returns finite lat/lng and a non-empty formattedAddress", async () => {
      const provider = makeProvider();
      const result = await provider.resolve({ address: UPSTREAM_SUCCESS_QUERY, persist: false });
      expect(result).not.toBeNull();
      expect(Number.isFinite(result!.lat)).toBe(true);
      expect(Number.isFinite(result!.lng)).toBe(true);
      expect(result!.formattedAddress.length).toBeGreaterThan(0);
    });

    it("latitude is within +/-90 and longitude within +/-180 — the transposition guard", async () => {
      const provider = makeProvider();
      const result = await provider.resolve({ address: UPSTREAM_SUCCESS_QUERY, persist: false });
      expect(result).not.toBeNull();
      expect(result!.lat).toBeGreaterThanOrEqual(-90);
      expect(result!.lat).toBeLessThanOrEqual(90);
      expect(result!.lng).toBeGreaterThanOrEqual(-180);
      expect(result!.lng).toBeLessThanOrEqual(180);
    });
  });
}
