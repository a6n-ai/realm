"use client";

import { useEffect } from "react";

// WebMCP (webmachinelearning.github.io/webmcp): lets an AI agent in the visitor's browser ask the page
// what it can do. Three read-only tools over the public API; nothing runs where the API is absent.
type Tool = { name: string; description: string; inputSchema: object; execute: (input: Record<string, unknown>) => Promise<unknown> };
type ModelContext = { registerTool: (tool: Tool, options?: { signal?: AbortSignal }) => unknown };

const read = (path: string) => async () => {
  const res = await fetch(`/api/public/v1${path}`);
  return { content: [{ type: "text", text: await res.text() }] };
};
const none = { type: "object", properties: {} };

const TOOLS: Tool[] = [
  {
    name: "check_delivery",
    description: "Check whether Tiffin Grab delivers to a Canadian postal code (like M5V 2T6) and in which delivery window.",
    inputSchema: { type: "object", properties: { postal: { type: "string", description: "Postal code or its first three characters" } }, required: ["postal"] },
    execute: (input) => read(`/delivery/check?postal=${encodeURIComponent(String(input.postal ?? ""))}`)(),
  },
  { name: "get_plans", description: "Tiffin Grab plans: meal sizes, contents, calories and price per tiffin in CAD.", inputSchema: none, execute: read("/plans") },
  { name: "get_menu", description: "This week's Tiffin Grab menu, day by day.", inputSchema: none, execute: read("/menu") },
];

export function WebMcpTools() {
  useEffect(() => {
    const mc = (document as { modelContext?: ModelContext }).modelContext ?? (navigator as { modelContext?: ModelContext }).modelContext;
    if (!mc?.registerTool) return;
    const ac = new AbortController();
    for (const t of TOOLS) Promise.resolve(mc.registerTool(t, { signal: ac.signal })).catch(() => {});
    return () => ac.abort();
  }, []);
  return null;
}
