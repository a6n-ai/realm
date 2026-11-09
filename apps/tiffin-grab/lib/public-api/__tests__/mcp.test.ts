import { describe, expect, it } from "vitest";
import { handleMcp } from "@/lib/public-api/mcp";
import type { loadPublic } from "@/lib/public-api/load";

const load = {
  check: async (postal: string) => ({ postal, served: true, area: "Toronto", window: null }),
  plans: async () => ({ currency: "CAD", plans: [] }),
} as unknown as typeof loadPublic;
const call = (method: string, params?: object, id = 1) => handleMcp({ jsonrpc: "2.0", id, method, params: params as Record<string, unknown> }, load);

describe("MCP server", () => {
  it("initialize echoes a supported version and falls back to the newest", async () => {
    expect(await call("initialize", { protocolVersion: "2025-06-18" })).toMatchObject({ result: { protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "tiffin-grab" } } });
    expect(await call("initialize", { protocolVersion: "1999-01-01" })).toMatchObject({ result: { protocolVersion: "2025-11-25" } });
  });

  it("notifications get no response", async () => {
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, load)).toBeNull();
  });

  it("lists read-only tools", async () => {
    const r = (await call("tools/list")) as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } };
    expect(r.result.tools.map((t) => t.name)).toContain("check_delivery");
    expect(r.result.tools.every((t) => t.annotations.readOnlyHint)).toBe(true);
  });

  it("check_delivery normalizes the postal code and returns structured content", async () => {
    expect(await call("tools/call", { name: "check_delivery", arguments: { postal: "m5v 2t6" } })).toMatchObject({ result: { structuredContent: { postal: "M5V2T6", served: true } } });
  });

  it("a bad postal code is a tool error, not a protocol error", async () => {
    expect(await call("tools/call", { name: "check_delivery", arguments: { postal: "12345" } })).toMatchObject({ result: { isError: true } });
  });

  it("unknown tools and methods are JSON-RPC errors", async () => {
    expect(await call("tools/call", { name: "order_tiffin" })).toMatchObject({ error: { code: -32602 } });
    expect(await call("resources/list")).toMatchObject({ error: { code: -32601 } });
    expect(await handleMcp({ method: "ping", id: 1 }, load)).toMatchObject({ error: { code: -32600 } });
  });
});

describe("agent discovery documents", async () => {
  const { agentSkillMd, agentSkillsIndex, aiCatalog, mcpServerCard, sha256Hex } = await import("@/lib/public-api/discovery");
  const o = "https://tiffingrab.ca";

  it("the skills index digest is the SKILL.md it serves", async () => {
    const idx = await agentSkillsIndex(o);
    expect(idx.skills[0]!.digest).toBe(`sha256:${await sha256Hex(agentSkillMd(o))}`);
    expect(idx.skills[0]!.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("server card points at the MCP endpoint; catalog entries carry 2 to 5 queries and one url", () => {
    expect(mcpServerCard(o).transport.endpoint).toBe(`${o}/api/public/mcp`);
    for (const e of aiCatalog(o).entries) {
      expect(e.identifier).toMatch(/^urn:air:tiffingrab\.ca:/);
      expect(e.representativeQueries.length).toBeGreaterThanOrEqual(2);
      expect(e.representativeQueries.length).toBeLessThanOrEqual(5);
    }
  });
});

describe("MCP robustness", () => {
  it("null params do not throw", async () => {
    const load = {} as never;
    expect(await handleMcp({ jsonrpc: "2.0", id: 1, method: "initialize", params: null as never }, load)).toMatchObject({ result: { protocolVersion: "2025-11-25" } });
    expect(await handleMcp({ jsonrpc: "2.0", id: 2, method: "tools/call", params: null as never }, load)).toMatchObject({ error: { code: -32602 } });
  });
});
