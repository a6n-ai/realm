// The one description of the public API: /openapi.json serves it and /docs is generated from it.
import { CONTACT_EMAIL, CONTACT_PHONE, SUPPORT_E164 } from "@/lib/brand";
type Json = Record<string, unknown>;

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const ok = (description: string, schema: Json, example: unknown) => ({
  "200": { description, content: { "application/json": { schema, example } } },
});
const win = { oneOf: [{ type: "object", properties: { from: { type: "string" }, to: { type: "string" } }, required: ["from", "to"] }, { type: "string" }, { type: "null" }] };

export function openApi(origin: string): Json & { paths: Record<string, { get: Json & { summary: string; description: string; parameters?: Json[]; responses: Record<string, Json> } }> } {
  return {
    openapi: "3.1.0",
    info: {
      title: "Tiffin Grab public API",
      version: "1.0.0",
      description: "Read-only JSON of what the public pages at tiffingrab.ca already show: plans and prices, delivery areas and windows, this week's menu, current offers, the referral offer, the FAQ and contact details. No authentication; no customer or order data.",
    },
    servers: [{ url: `${origin}/api/public/v1` }],
    paths: {
      "/plans": {
        get: {
          summary: "Plans, meal sizes and prices",
          description: "Every public plan with its meal sizes, price per tiffin, contents and calories, plus longer-plan discounts and the trial offer.",
          responses: ok("Plans", ref("Plans"), {
            currency: "CAD",
            plans: [{ key: "veg", name: "Veg", description: null, sizes: [{ name: "Regular", pricePerTiffin: 12.99, contains: ["Sabzi", "Dal", "Rice", "Roti"], kcal: { min: 700, max: 900 }, proteinG: null, trial: false }] }],
            longerPlanDiscounts: [{ weeks: 8, label: "8 weeks or more", percent: 10 }],
            trial: { length: "1 week", pricePerTiffin: 14.99 },
            source: `${origin}/pricing`,
          }),
        },
      },
      "/delivery": {
        get: {
          summary: "Delivery areas, windows and rules",
          description: "Active delivery areas with postal prefixes and delivery windows, the order cutoff and the delivery charge.",
          responses: ok("Delivery", ref("Delivery"), {
            areas: [{ name: "Brampton", postalPrefixes: ["L6"], window: { from: "11 AM", to: "2 PM" } }],
            windows: [{ label: "11 AM to 2 PM", areas: ["Brampton"] }],
            cutoff: "9 PM",
            freeDelivery: true,
            deliveryCharge: "Delivery is free.",
            weekendRule: "Saturday and Sunday tiffins come with the Friday delivery",
            days: "Monday to Friday",
            source: `${origin}/locations`,
          }),
        },
      },
      "/delivery/check": {
        get: {
          summary: "Do we deliver to a postal code",
          description: "Matches the longest active-area postal prefix. Accepts a full Canadian postal code or its first three characters; spaces and case are ignored.",
          parameters: [{ name: "postal", in: "query", required: true, description: "Postal code (M5V 2T6) or FSA (M5V)", schema: { type: "string" }, example: "M5V2T6" }],
          responses: {
            ...ok("Result", ref("DeliveryCheck"), { postal: "M5V2T6", served: true, area: "Toronto", window: { from: "11 AM", to: "2 PM" } }),
            "400": { description: "Missing or invalid postal code", content: { "application/json": { schema: ref("Error"), example: { error: "postal must be a Canadian postal code or its first three characters, like M5V 2T6" } } } },
          },
        },
      },
      "/promotions": {
        get: {
          summary: "Current offers",
          description: "The offers the website shows right now.",
          responses: ok("Promotions", ref("Promotions"), { promotions: [{ title: "10% off with WELCOME", description: "On plans of 8 weeks or more", code: "WELCOME", url: `${origin}/subscribe?c=WELCOME`, badge: "Save 10%" }] }),
        },
      },
      "/menu": {
        get: {
          summary: "This week's menu",
          description: "The published week day by day, dishes grouped by type (sabzi, dal, rice and so on), plus the weekend dishes that come with Friday's delivery. weekStart is null before a week is published.",
          responses: ok("Menu", ref("Menu"), {
            weekStart: "2026-11-09",
            days: [{ day: "Monday", date: "Nov 9", dishes: { Sabzi: ["Aloo Gobi", "Chana Masala"], Dal: ["Dal Tadka"] } }],
            weekend: { date: "Nov 14", dishes: ["Rajma Chawal"], note: "Comes with the Friday delivery" },
            pdf: `${origin}/menu/weekly/pdf`,
            source: `${origin}/menu`,
          }),
        },
      },
      "/referral": {
        get: {
          summary: "Referral offer",
          description: "What a referred friend and the referrer each get right now. active is false when the program is off.",
          responses: ok("Referral", ref("Referral"), { active: true, headline: "Give $6, get $6.", friendGets: { amount: "$6", detail: "60 coins in your wallet" }, referrerGets: { amount: "$6", detail: "60 coins in your wallet" }, maxPerReferrer: 30, source: `${origin}/refer` }),
        },
      },
      "/faq": {
        get: {
          summary: "Frequently asked questions",
          description: "The questions and answers on the FAQ page, in their groups.",
          responses: ok("FAQ", ref("Faq"), { groups: [{ heading: "Delivery", items: [{ question: "Where do you deliver?", answer: "Across the Greater Toronto Area." }] }], source: `${origin}/faq` }),
        },
      },
      "/contact": {
        get: {
          summary: "How to reach us",
          description: "Email, phone and WhatsApp.",
          responses: ok("Contact", ref("Contact"), { email: CONTACT_EMAIL, phone: CONTACT_PHONE, whatsapp: `https://wa.me/${SUPPORT_E164}`, source: `${origin}/contact` }),
        },
      },
      "/health": {
        get: { summary: "Liveness check", description: "Always answers without touching the database.", responses: ok("OK", ref("Health"), { status: "ok" }) },
      },
      "/openapi.json": {
        get: { summary: "This OpenAPI description", description: "OpenAPI 3.1 document for this API.", responses: { "200": { description: "OpenAPI document", content: { "application/openapi+json": { schema: { type: "object" } } } } } },
      },
      "/docs": {
        get: { summary: "Guide", description: "This API as a Markdown guide.", responses: { "200": { description: "Markdown", content: { "text/markdown": { schema: { type: "string" } } } } } },
      },
    },
    components: {
      schemas: {
        Plans: {
          type: "object",
          required: ["currency", "plans", "longerPlanDiscounts", "trial", "source"],
          properties: {
            currency: { type: "string" },
            plans: { type: "array", items: { type: "object", required: ["key", "name", "sizes"], properties: { key: { type: "string" }, name: { type: "string" }, description: { type: ["string", "null"] }, sizes: { type: "array", items: { type: "object", required: ["name", "pricePerTiffin", "contains", "kcal", "trial"], properties: { name: { type: "string" }, pricePerTiffin: { type: "number" }, contains: { type: "array", items: { type: "string" } }, kcal: { type: "object", properties: { min: { type: "number" }, max: { type: "number" } } }, proteinG: { type: ["number", "null"] }, trial: { type: "boolean" } } } } } } },
            longerPlanDiscounts: { type: "array", items: { type: "object", properties: { weeks: { type: "number" }, label: { type: "string" }, percent: { type: "number" } } } },
            trial: { type: ["object", "null"], properties: { length: { type: "string" }, pricePerTiffin: { type: "number" } } },
            source: { type: "string", format: "uri" },
          },
        },
        Delivery: {
          type: "object",
          required: ["areas", "windows", "cutoff", "freeDelivery", "deliveryCharge", "weekendRule", "days", "source"],
          properties: {
            areas: { type: "array", items: { type: "object", properties: { name: { type: "string" }, postalPrefixes: { type: "array", items: { type: "string" } }, window: win } } },
            windows: { type: "array", items: { type: "object", properties: { label: { type: "string" }, areas: { type: "array", items: { type: "string" } } } } },
            cutoff: { type: ["string", "null"] },
            freeDelivery: { type: "boolean" },
            deliveryCharge: { type: "string" },
            weekendRule: { type: "string" },
            days: { type: "string" },
            source: { type: "string", format: "uri" },
          },
        },
        DeliveryCheck: {
          type: "object",
          required: ["postal", "served", "area", "window"],
          properties: { postal: { type: "string" }, served: { type: "boolean" }, area: { type: ["string", "null"] }, window: win },
        },
        Promotions: {
          type: "object",
          required: ["promotions"],
          properties: { promotions: { type: "array", items: { type: "object", required: ["title", "url"], properties: { title: { type: "string" }, description: { type: ["string", "null"] }, code: { type: ["string", "null"] }, url: { type: "string", format: "uri" }, badge: { type: ["string", "null"] } } } } },
        },
        Menu: {
          type: "object",
          required: ["weekStart", "days", "weekend", "pdf", "source"],
          properties: {
            weekStart: { type: ["string", "null"], format: "date" },
            days: { type: "array", items: { type: "object", required: ["day", "date", "dishes"], properties: { day: { type: "string" }, date: { type: "string" }, dishes: { type: "object", additionalProperties: { type: "array", items: { type: "string" } } } } } },
            weekend: { oneOf: [{ type: "object", properties: { date: { type: "string" }, dishes: { type: "array", items: { type: "string" } }, note: { type: "string" } } }, { type: "null" }] },
            pdf: { type: "string", format: "uri" },
            source: { type: "string", format: "uri" },
          },
        },
        Referral: {
          type: "object",
          required: ["active", "source"],
          properties: { active: { type: "boolean" }, headline: { type: ["string", "null"] }, friendGets: { oneOf: [{ type: "object", required: ["amount"], properties: { amount: { type: "string" }, detail: { type: ["string", "null"] } } }, { type: "null" }] }, referrerGets: { oneOf: [{ type: "object", required: ["amount"], properties: { amount: { type: "string" }, detail: { type: ["string", "null"] } } }, { type: "null" }] }, maxPerReferrer: { type: ["integer", "null"] }, source: { type: "string", format: "uri" } },
        },
        Faq: {
          type: "object",
          required: ["groups", "source"],
          properties: {
            groups: { type: "array", items: { type: "object", properties: { heading: { type: ["string", "null"] }, items: { type: "array", items: { type: "object", required: ["question", "answer"], properties: { question: { type: "string" }, answer: { type: "string" } } } } } } },
            source: { type: "string", format: "uri" },
          },
        },
        Contact: {
          type: "object",
          required: ["email", "phone", "whatsapp", "source"],
          properties: { email: { type: "string", format: "email" }, phone: { type: "string" }, whatsapp: { type: "string", format: "uri" }, source: { type: "string", format: "uri" } },
        },
        Health: { type: "object", required: ["status"], properties: { status: { const: "ok" } } },
        Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
      },
    },
  };
}

/** The same document as a Markdown guide. */
export function docsMarkdown(origin: string): string {
  const spec = openApi(origin);
  const base = (spec.servers as { url: string }[])[0]!.url;
  const lines = [
    `# ${(spec.info as { title: string }).title}`,
    "",
    (spec.info as { description: string }).description,
    "",
    `Base URL: ${base}`,
    "",
    "All endpoints are GET, return JSON (except this guide), allow any origin and are cached for five minutes.",
    "",
    "## Endpoints",
    "",
  ];
  for (const [path, { get }] of Object.entries(spec.paths)) {
    lines.push(`### GET ${path}`, "", `${get.summary}. ${get.description}`, "");
    for (const p of (get.parameters ?? []) as { name: string; in: string; required: boolean; description: string }[]) {
      lines.push(`- \`${p.name}\` (${p.in}, ${p.required ? "required" : "optional"}): ${p.description}`);
    }
    if (get.parameters?.length) lines.push("");
    for (const [status, r] of Object.entries(get.responses as Record<string, { description: string; content?: Record<string, { example?: unknown }> }>)) {
      const [type, body] = Object.entries(r.content ?? {})[0] ?? [];
      lines.push(`${status}: ${r.description}${type ? ` (${type})` : ""}`);
      if (body?.example !== undefined) lines.push("", "```json", JSON.stringify(body.example, null, 2), "```");
      lines.push("");
    }
  }
  lines.push("## Discovery", "", `- Catalog: ${origin}/.well-known/api-catalog`, `- OpenAPI: ${base}/openapi.json`, `- MCP server (Streamable HTTP, read-only, no auth): ${origin}/api/public/mcp`, "");
  return lines.join("\n");
}

/** RFC 9727 api-catalog (linkset, Appendix A). */
export function apiCatalog(origin: string) {
  const base = `${origin}/api/public/v1`;
  return {
    linkset: [
      {
        anchor: base,
        "service-desc": [{ href: `${base}/openapi.json`, type: "application/openapi+json" }],
        "service-doc": [{ href: `${base}/docs`, type: "text/markdown" }],
        status: [{ href: `${base}/health`, type: "application/json" }],
      },
      // The same data as MCP tools (lib/public-api/mcp.ts), documented in the guide above.
      { anchor: `${origin}/api/public/mcp`, "service-doc": [{ href: `${base}/docs`, type: "text/markdown" }] },
    ],
  };
}
