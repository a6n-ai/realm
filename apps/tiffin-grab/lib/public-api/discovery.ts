// Agent discovery documents that point at the public API and the MCP server. Pure; routes under app/.well-known serve them.
import { INSTRUCTIONS, MCP_VERSIONS, TOOLS } from "@/lib/public-api/mcp";

const host = (origin: string) => new URL(origin).hostname;

/** MCP Server Card (SEP-1649, draft): what the server is and where it listens, before an agent connects. */
export const mcpServerCard = (origin: string) => ({
  serverInfo: { name: "tiffin-grab", title: "Tiffin Grab", version: "1.0.0", websiteUrl: origin },
  description: INSTRUCTIONS,
  protocolVersion: MCP_VERSIONS[0],
  transport: { type: "streamable-http", endpoint: `${origin}/api/public/mcp` },
  capabilities: { tools: { listChanged: false } },
  authentication: { required: false },
  tools: TOOLS.map(({ name, title, description }) => ({ name, title, description })),
});

/** ARD ai-catalog: one entry per machine-readable resource. */
export const aiCatalog = (origin: string) => {
  const urn = (ns: string, name: string) => `urn:air:${host(origin)}:${ns}:${name}`;
  return {
    specVersion: "1.0",
    host: { displayName: "Tiffin Grab", identifier: `did:web:${host(origin)}` },
    entries: [
      {
        identifier: urn("server", "tiffin-grab"),
        displayName: "Tiffin Grab MCP server",
        type: "application/mcp-server-card+json",
        url: `${origin}/.well-known/mcp/server-card.json`,
        representativeQueries: ["does Tiffin Grab deliver to M5V 2T6", "how much is a veg tiffin in Toronto", "what is on the Tiffin Grab menu this week", "tiffin delivery areas in the GTA"],
      },
      {
        identifier: urn("api", "public-v1"),
        displayName: "Tiffin Grab public API",
        type: "application/openapi+json",
        url: `${origin}/api/public/v1/openapi.json`,
        representativeQueries: ["Tiffin Grab plans and prices as JSON", "Tiffin Grab delivery windows by area", "current Tiffin Grab coupon codes"],
      },
      {
        identifier: urn("doc", "llms"),
        displayName: "Tiffin Grab for AI assistants",
        type: "text/plain",
        url: `${origin}/llms.txt`,
        representativeQueries: ["what is Tiffin Grab", "home-style Indian tiffin service in Brampton and Toronto"],
      },
    ],
  };
};

/** The one agent skill: how to answer questions about Tiffin Grab with the API or the MCP server. */
export const agentSkillMd = (origin: string) => `---
name: tiffin-grab
description: Answer questions about Tiffin Grab, a home-style Indian tiffin delivery service in the Greater Toronto Area - delivery by postal code, plans and prices, this week's menu, offers, FAQ and contact - from its live public API.
---

# Tiffin Grab

Tiffin Grab delivers home-style Indian tiffins (sabzi, dal, rice, roti) across the Greater Toronto Area, Monday to Friday. Prices are in CAD. Everything here is public and read-only; ordering happens on ${origin}.

## Connect

- MCP server (Streamable HTTP, no auth): ${origin}/api/public/mcp
- Or plain JSON: ${origin}/api/public/v1 (OpenAPI: ${origin}/api/public/v1/openapi.json)

## Answering

1. Someone gives a postal code: call \`check_delivery\` (or GET /delivery/check?postal=...) before anything else. If it is not served, say so and point to ${origin}/contact.
2. Prices: \`get_plans\`. Quote the price per tiffin with its meal size, and mention longer-plan discounts and the trial when they apply.
3. Food: \`get_menu\` for this week. Weekend tiffins come with the Friday delivery.
4. Offers: \`get_promotions\` and \`get_referral_offer\`. Only quote codes these return.
5. Anything else: \`get_faq\`, then \`get_contact\`.

Link the \`source\` URL each answer carries, and send people to ${origin}/subscribe to start.
`;

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Agent Skills Discovery index (v0.2.0); the digest is over the exact bytes SKILL.md serves. */
export const agentSkillsIndex = async (origin: string) => ({
  $schema: "https://schemas.agentskills.io/discovery/0.2.0/schema.json",
  skills: [
    {
      name: "tiffin-grab",
      type: "skill-md",
      description: "Answer questions about Tiffin Grab (GTA tiffin delivery): postal-code delivery check, plans and prices, weekly menu, offers, FAQ and contact.",
      url: `${origin}/.well-known/agent-skills/tiffin-grab/SKILL.md`,
      digest: `sha256:${await sha256Hex(agentSkillMd(origin))}`,
    },
  ],
});
