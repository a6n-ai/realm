import { describe, expect, it } from "vitest";
import type { FacetDef } from "@foundry/design-system";
import {
  activePresetKey,
  applyPreset,
  canonicalParams,
  facetFields,
  managedKeys,
  presetFromCanonical,
  type FilterPreset,
} from "../presets";

const spec: FacetDef[] = [
  { kind: "pills", field: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }] },
  { kind: "select", field: "owner", label: "Owner", options: [{ value: "usr_me", label: "Asha" }, { value: "usr_b", label: "Ben" }] },
  { kind: "multi", field: "plan", label: "Plan", options: [{ value: "veg", label: "Veg" }, { value: "nonveg", label: "Non-veg" }] },
  { kind: "dateRange", field: "createdAt", label: "Created" },
  { kind: "search", fields: ["name"] },
];
const fields = facetFields(spec);

describe("filter presets", () => {
  const presets: FilterPreset[] = [{ key: "mine", label: "Mine", params: { status: "active", owner: "usr_me" } }];
  const managed = managedKeys(presets, fields);

  it("facet fields skip search and dates", () => {
    expect(fields).toEqual(["status", "owner", "plan"]);
  });

  it("apply clears other picks and page, keeps search and dates", () => {
    const sp = applyPreset(new URLSearchParams("plan=veg&page=3&q=ram&from=1"), presets[0], managed);
    expect(Object.fromEntries(sp)).toEqual({ q: "ram", from: "1", status: "active", owner: "usr_me" });
  });

  it("active only on an exact match of managed keys", () => {
    expect(activePresetKey(new URLSearchParams("owner=usr_me&status=active&q=x"), presets, managed)).toBe("mine");
    expect(activePresetKey(new URLSearchParams("owner=usr_me&status=active&plan=veg"), presets, managed)).toBeNull();
  });
});

describe("learned recommendations", () => {
  it("canonical form is order-insensitive, swaps own owner for me, ignores search and dates", () => {
    const a = canonicalParams(new URLSearchParams("plan=nonveg,veg&owner=usr_me&q=x&from=1"), fields, "usr_me");
    const b = canonicalParams(new URLSearchParams("owner=usr_me&plan=veg,nonveg"), fields, "usr_me");
    expect(a).toBe(b);
    expect(a).toBe("owner=me&plan=nonveg%2Cveg");
    expect(canonicalParams(new URLSearchParams("q=x"), fields, "usr_me")).toBe("");
  });

  it("someone else's owner id stays as is", () => {
    expect(canonicalParams(new URLSearchParams("owner=usr_b"), fields, "usr_me")).toBe("owner=usr_b");
  });

  it("expands me to the viewer and labels from the facets", () => {
    const p = presetFromCanonical("owner=me&status=paused", spec, "usr_b");
    expect(p?.params).toEqual({ status: "paused", owner: "usr_b" });
    expect(p?.label).toBe("Status: Paused · Owner: Me");
  });

  it("drops combinations with unknown fields or values", () => {
    expect(presetFromCanonical("status=gone", spec, "usr_me")).toBeNull();
    expect(presetFromCanonical("zone=north", spec, "usr_me")).toBeNull();
    expect(presetFromCanonical("", spec, "usr_me")).toBeNull();
  });
});
