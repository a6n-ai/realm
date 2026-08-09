#!/usr/bin/env -S npx tsx
/**
 * Diagnostic script — NOT a test, NOT run in CI. Resolves a fixture of real
 * Canadian addresses through every provider that has credentials configured
 * and prints a comparison table, flagging dropped unit numbers and
 * disagreements large enough to flip a delivery-zone decision.
 *
 * Usage: AWS_PROFILE=realm-admin GOOGLE_PLACES_API_KEY=... pnpm tsx scripts/compare-providers.ts
 */
import { GeoPlacesClient, GeocodeCommand } from "@aws-sdk/client-geo-places";
import { awsPlaceProvider } from "../src/aws-provider";
import { googlePlaceProvider } from "../src/google-provider";
import { CANADIAN_ADDRESS_FIXTURES } from "../src/__tests__/fixtures/canadian-addresses";
import type { PlaceProvider, ResolvedPlace } from "../src/types";

if (process.env.CI) {
  console.error("compare-providers.ts is a live-network diagnostic script — refusing to run in CI.");
  process.exit(1);
}

// Distance-away zone rules (7 km radius) make >100m disagreements matter.
const FLAG_DISTANCE_METRES = 100;

const PROVIDER_IDS = ["aws", "google"] as const;
type ProviderId = (typeof PROVIDER_IDS)[number];

// awsPlaceProvider().resolve() never throws by contract (production must
// degrade to the next provider, not crash checkout) — so it can't tell this
// script apart "credentials denied" from "no match found". A denied/expired
// credential fails identically on all 15 rows, so check once, up front,
// against the AWS SDK directly, instead of burning 15 billable calls that
// would all fail the same way.
async function checkAwsAccess(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!process.env.AWS_PROFILE && !process.env.AWS_ACCESS_KEY_ID) {
    return { ok: false, reason: "AWS_PROFILE / AWS_ACCESS_KEY_ID not set" };
  }
  try {
    await new GeoPlacesClient({}).send(new GeocodeCommand({ QueryText: CANADIAN_ADDRESS_FIXTURES[0].address }));
    return { ok: true };
  } catch (e) {
    const err = e as { name?: string; message?: string };
    return { ok: false, reason: `${err.name ?? "Error"}: ${err.message ?? String(e)}` };
  }
}

const availability: Record<ProviderId, { ok: boolean; reason: string }> = {
  aws: await checkAwsAccess().then((r) => (r.ok ? { ok: true, reason: "" } : r)),
  google: {
    ok: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    reason: "GOOGLE_PLACES_API_KEY not set",
  },
};

const providerFactories: Record<ProviderId, () => PlaceProvider> = {
  aws: awsPlaceProvider,
  google: googlePlaceProvider,
};

const activeProviders = new Map<ProviderId, PlaceProvider>();
for (const id of PROVIDER_IDS) {
  if (availability[id].ok) activeProviders.set(id, providerFactories[id]());
  else console.warn(`[skip] ${id}: ${availability[id].reason}`);
}

if (activeProviders.size === 0) {
  console.error("No provider is usable — nothing to compare.");
  process.exit(1);
}

function haversineMetres(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// "unavailable" (no credentials) must never render the same as "resolved to
// nothing" — that distinction is the whole point of a per-row state.
type RowState =
  | { kind: "unavailable"; reason: string }
  | { kind: "not-resolved" }
  | { kind: "resolved"; place: ResolvedPlace };

async function main() {
  const flags: string[] = [];

  for (const fixture of CANADIAN_ADDRESS_FIXTURES) {
    console.log(`\n=== ${fixture.label} ===`);
    console.log(`input: ${fixture.address}`);
    console.log(`note:  ${fixture.note}`);

    const states = new Map<ProviderId, RowState>();
    for (const id of PROVIDER_IDS) {
      if (!activeProviders.has(id)) {
        states.set(id, { kind: "unavailable", reason: availability[id].reason });
        continue;
      }
      const place = await activeProviders.get(id)!.resolve({ address: fixture.address, persist: false });
      states.set(id, place ? { kind: "resolved", place } : { kind: "not-resolved" });
    }

    for (const id of PROVIDER_IDS) {
      const state = states.get(id)!;
      if (state.kind === "unavailable") {
        console.log(`  ${id}: SKIPPED — ${state.reason}`);
      } else if (state.kind === "not-resolved") {
        console.log(`  ${id}: NOT RESOLVED`);
      } else {
        const { lat, lng, formattedAddress } = state.place;
        console.log(`  ${id}: "${formattedAddress}" (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
        if (fixture.expectedUnitFragment && !formattedAddress.includes(fixture.expectedUnitFragment)) {
          const msg = `${fixture.label}: ${id} DROPPED unit fragment "${fixture.expectedUnitFragment}"`;
          flags.push(msg);
          console.log(`  FLAG: ${msg}`);
        }
      }
    }

    const resolvedEntries = [...states.entries()].filter(
      (e): e is [ProviderId, Extract<RowState, { kind: "resolved" }>] => e[1].kind === "resolved",
    );
    if (resolvedEntries.length === 2) {
      const [[, a], [, b]] = resolvedEntries;
      const distance = haversineMetres(a.place, b.place);
      console.log(`  distance: ${distance.toFixed(1)} m`);
      if (distance > FLAG_DISTANCE_METRES) {
        const msg = `${fixture.label}: aws/google ${distance.toFixed(1)}m apart (> ${FLAG_DISTANCE_METRES}m)`;
        flags.push(msg);
        console.log(`  FLAG: ${msg}`);
      }
    } else {
      // Only flag a resolve/no-resolve split when both providers actually ran —
      // a provider that was SKIPPED for missing credentials isn't a disagreement.
      const ran = PROVIDER_IDS.filter((id) => states.get(id)!.kind !== "unavailable");
      if (ran.length === 2) {
        const resolvedIds = resolvedEntries.map(([id]) => id);
        const notResolvedIds = ran.filter((id) => !resolvedIds.includes(id));
        if (resolvedIds.length > 0 && notResolvedIds.length > 0) {
          const msg = `${fixture.label}: ${resolvedIds.join(",")} resolved, ${notResolvedIds.join(",")} did not`;
          flags.push(msg);
          console.log(`  FLAG: ${msg}`);
        }
      }
    }
  }

  console.log(`\n=== Summary: ${flags.length} flag(s) ===`);
  for (const f of flags) console.log(`- ${f}`);
}

main();
