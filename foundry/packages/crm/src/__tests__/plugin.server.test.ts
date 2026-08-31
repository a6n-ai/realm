import { describe, it, expect } from "vitest";
import {
  resolveStatuses,
  blockedBy,
  dependents,
  type PluginRegistry,
  type PluginServer,
} from "../plugin.server";

function fake(id: string, installed: boolean, requires?: string[]): PluginServer {
  return {
    id,
    requires,
    status: async () => ({ installed }),
    install: async () => {},
    uninstall: async () => {},
  };
}

const registry: PluginRegistry = [
  fake("clover", true),
  fake("payments", false, ["clover"]),
  fake("google-reviews", false),
];

describe("resolveStatuses", () => {
  it("returns a status keyed by plugin id", async () => {
    expect(await resolveStatuses(registry)).toEqual({
      clover: { installed: true },
      payments: { installed: false },
      "google-reviews": { installed: false },
    });
  });
});

describe("blockedBy", () => {
  it("is empty when the plugin declares no requirements", async () => {
    const s = await resolveStatuses(registry);
    expect(blockedBy(registry, "google-reviews", s)).toEqual([]);
  });

  it("is empty when every requirement is installed", async () => {
    const s = await resolveStatuses(registry);
    expect(blockedBy(registry, "payments", s)).toEqual([]);
  });

  it("names each uninstalled requirement", async () => {
    const s = { clover: { installed: false }, payments: { installed: false } };
    expect(blockedBy(registry, "payments", s)).toEqual(["clover"]);
  });

  it("treats an unknown plugin id as unblocked", async () => {
    expect(blockedBy(registry, "nope", {})).toEqual([]);
  });
});

describe("dependents", () => {
  it("names plugins that require the given plugin", () => {
    expect(dependents(registry, "clover")).toEqual(["payments"]);
  });

  it("is empty when nothing requires it", () => {
    expect(dependents(registry, "payments")).toEqual([]);
  });
});
