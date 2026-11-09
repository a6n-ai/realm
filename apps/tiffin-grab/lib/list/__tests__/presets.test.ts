import { describe, expect, it } from "vitest";
import { facetFields, type FacetDef } from "@foundry/design-system";
import {
  canonicalParams,
  presetFromCanonical,
  resolveOwnerParam,
} from "../presets";

describe("resolveOwnerParam", () => {
  it("maps me to the viewer, all to no filter, and keeps an explicit owner", () => {
    expect(resolveOwnerParam("me", "usr_me")).toBe("usr_me");
    expect(resolveOwnerParam("all", "usr_me")).toBeUndefined();
    expect(resolveOwnerParam("usr_b", "usr_me")).toBe("usr_b");
    expect(resolveOwnerParam(undefined, "usr_me")).toBeUndefined();
  });
});

const spec: FacetDef[] = [
  { kind: "pills", field: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "paused", label: "Paused" }] },
  { kind: "select", field: "owner", label: "Owner", options: [{ value: "usr_me", label: "Asha" }, { value: "usr_b", label: "Ben" }] },
  { kind: "multi", field: "plan", label: "Plan", options: [{ value: "veg", label: "Veg" }, { value: "nonveg", label: "Non-veg" }] },
  { kind: "dateRange", field: "createdAt", label: "Created" },
  { kind: "search", fields: ["name"] },
];
const fields = facetFields(spec);

describe("filter presets", () => {
  it("facet fields skip search and dates", () => {
    expect(fields).toEqual(["status", "owner", "plan"]);
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
