// A read-only MCP server (Streamable HTTP, stateless): each POST is one JSON-RPC message, answered with JSON.
// No sessions, no streaming, no auth: every tool returns what the public pages already show (lib/public-api/load.ts).
// Tool calls are POSTs, which the edge cache skips; loadPublic shares each answer through Workers KV for 60 s instead.
import { normalizePostal, POSTAL_HINT } from "@/lib/public-api/postal";
import type { loadPublic } from "@/lib/public-api/load";

type Loaders = typeof loadPublic;
type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

export const MCP_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];
const none = { type: "object", properties: {}, additionalProperties: false };

export const TOOLS = [
  { name: "check_delivery", title: "Check delivery", description: "Does Tiffin Grab deliver to a Canadian postal code, and in which window. Accepts a full code (M5V 2T6) or its first three characters (M5V).", inputSchema: { type: "object", properties: { postal: { type: "string", description: "Postal code, like M5V 2T6 or M5V" } }, required: ["postal"], additionalProperties: false } },
  { name: "get_plans", title: "Plans and prices", description: "Veg and non-veg plans: meal sizes, what each tiffin contains, calories, price per tiffin in CAD, longer-plan discounts and the trial.", inputSchema: none },
  { name: "get_delivery_areas", title: "Delivery areas", description: "Every delivery area across the GTA with its postal prefixes and delivery window, the order cutoff, the delivery charge and the weekend rule.", inputSchema: none },
  { name: "get_menu", title: "This week's menu", description: "The published menu for this week, day by day, dishes grouped by type, plus the weekend dishes.", inputSchema: none },
  { name: "get_promotions", title: "Current offers", description: "The offers and coupon codes the website shows right now.", inputSchema: none },
  { name: "get_referral_offer", title: "Referral offer", description: "What a referred friend and the person who referred them each get.", inputSchema: none },
  { name: "get_faq", title: "FAQ", description: "Frequently asked questions about delivery, changes, pricing and payment, with answers.", inputSchema: none },
  { name: "get_contact", title: "Contact", description: "Email, phone and WhatsApp for Tiffin Grab.", inputSchema: none },
].map((t) => ({ ...t, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } }));

export const INSTRUCTIONS = "Tiffin Grab delivers home-style Indian tiffins across the Greater Toronto Area. Use check_delivery before recommending a plan to someone with a postal code. Prices are in CAD. Ordering happens on https://tiffingrab.ca; these tools only read public information.";

async function callTool(name: string, args: Record<string, unknown>, load: Loaders): Promise<unknown | { error: string }> {
  switch (name) {
    case "check_delivery": {
      const postal = normalizePostal(typeof args.postal === "string" ? args.postal : null);
      return postal ? load.check(postal) : { error: POSTAL_HINT };
    }
    case "get_plans": return load.plans();
    case "get_delivery_areas": return load.delivery();
    case "get_menu": return load.menu();
    case "get_promotions": return load.promotions();
    case "get_referral_offer": return load.referral();
    case "get_faq": return load.faq();
    case "get_contact": return load.contact();
  }
  return undefined;
}

const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

/** One JSON-RPC message in, its response out; null for a notification (the route answers 202). */
export async function handleMcp(msg: Rpc, load: Loaders): Promise<object | null> {
  if (msg?.jsonrpc !== "2.0" || typeof msg.method !== "string") return fail(msg?.id, -32600, "Invalid Request");
  if (msg.id === undefined) return null;
  const { id, method } = msg;
  const params = msg.params && typeof msg.params === "object" && !Array.isArray(msg.params) ? msg.params : {};
  const ok = (result: object) => ({ jsonrpc: "2.0", id, result });
  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return ok({
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "tiffin-grab", title: "Tiffin Grab", version: "1.0.0", websiteUrl: "https://tiffingrab.ca" },
        instructions: INSTRUCTIONS,
      });
    }
    case "ping": return ok({});
    case "tools/list": return ok({ tools: TOOLS });
    case "tools/call": {
      const name = String(params.name ?? "");
      const args = (params.arguments && typeof params.arguments === "object" ? params.arguments : {}) as Record<string, unknown>;
      if (!TOOLS.some((t) => t.name === name)) return fail(id, -32602, `Unknown tool: ${name}`);
      const out = await callTool(name, args, load);
      if (out && typeof out === "object" && "error" in out && Object.keys(out).length === 1) return ok({ content: [{ type: "text", text: (out as { error: string }).error }], isError: true });
      return ok({ content: [{ type: "text", text: JSON.stringify(out) }], structuredContent: out });
    }
  }
  return fail(id, -32601, `Method not found: ${method}`);
}
