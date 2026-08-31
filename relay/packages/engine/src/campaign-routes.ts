import { desc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { z } from "zod";
import type { AudienceDef, CampaignTables } from "./campaign-schema";
import type { NotificationTables } from "./schema";
import type { UsersRef } from "./enqueue";
import { countAudience, type AudienceDeps } from "./audience";
import { materializeCampaign } from "./campaign";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = PostgresJsDatabase<any>;

export interface CampaignRouteDeps {
  db: Db;
  tables: NotificationTables & CampaignTables;
  users: UsersRef;
  resolveSegment: AudienceDeps["resolveSegment"];
}

const audienceSchema = z.object({
  segment: z
    .object({
      lastOrderAfter: z.number().int().optional(),
      lastOrderBefore: z.number().int().optional(),
      minOrderCount: z.number().int().positive().optional(),
      minTotalSpend: z.number().positive().optional(),
      requireVerifiedPhone: z.boolean().optional(),
    })
    .optional(),
  listIds: z.array(z.string()).optional(),
});

export function createCampaignSchema(channels: [string, ...string[]]) {
  return z.object({
    name: z.string().trim().min(1),
    channels: z.array(z.enum(channels)).min(1),
    audience: audienceSchema,
    scheduledAt: z.number().int().positive().nullable().optional(),
  });
}

export interface CampaignListRow {
  publicId: string;
  name: string;
  channels: string[];
  status: string;
  scheduledAt: number | null;
  sentAt: number | null;
  counts: Record<string, number>;
  createdAt: number;
}

export async function listCampaigns(deps: CampaignRouteDeps): Promise<CampaignListRow[]> {
  const { db, tables } = deps;
  const rows = await db
    .select({
      publicId: tables.campaign.publicId,
      name: tables.campaign.name,
      channels: tables.campaign.channels,
      status: tables.campaign.status,
      scheduledAt: tables.campaign.scheduledAt,
      sentAt: tables.campaign.sentAt,
      counts: tables.campaign.counts,
      createdAt: tables.campaign.createdAt,
    })
    .from(tables.campaign)
    .orderBy(desc(tables.campaign.createdAt));
  return rows as CampaignListRow[];
}

export interface CreateCampaignInput {
  name: string;
  channels: string[];
  audience: AudienceDef;
  scheduledAt?: number | null;
}

export async function createCampaign(
  deps: CampaignRouteDeps,
  input: CreateCampaignInput,
): Promise<{ publicId: string }> {
  const { db, tables } = deps;
  const [row] = await db
    .insert(tables.campaign)
    .values({
      name: input.name,
      // channels is the shared notificationChannel pgEnum (fixed across all
      // apps); this function is generic, so the string[] input is widened here.
      channels: input.channels as never,
      audience: input.audience,
      // A campaign with a time is scheduled; without one it stays a draft until
      // someone presses Send.
      status: input.scheduledAt ? "scheduled" : "draft",
      scheduledAt: input.scheduledAt ?? null,
    })
    .returning({ publicId: tables.campaign.publicId });
  return { publicId: row.publicId as string };
}

export const setCampaignContentSchema = z.object({
  channel: z.string(),
  locale: z.string(),
  subject: z.string().trim().min(1),
  body: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  /** WhatsApp / templated SMS: the provider-side pre-approved template id. */
  providerTemplateId: z.string().trim().optional(),
});

export interface SetCampaignContentInput {
  channel: string;
  locale: string;
  subject: string;
  body?: string;
  html?: string;
  text?: string;
  providerTemplateId?: string;
}

export async function setCampaignContent(
  deps: CampaignRouteDeps,
  campaignPublicId: string,
  input: SetCampaignContentInput,
): Promise<{ ok: true } | { error: string; status: number }> {
  const { db, tables } = deps;

  const [row] = await db
    .select({ id: tables.campaign.id, status: tables.campaign.status })
    .from(tables.campaign)
    .where(eq(tables.campaign.publicId, campaignPublicId));
  if (!row) return { error: "Campaign not found", status: 404 };
  // Editing copy after the outbox rows exist would not change what was sent,
  // and would make the stored content disagree with the delivered message.
  if (row.status !== "draft" && row.status !== "scheduled") {
    return { error: "Content can only be edited while a campaign is draft or scheduled", status: 409 };
  }

  if (input.channel === "email" && (!input.html || !input.text)) {
    return { error: "Email content needs html and text", status: 400 };
  }
  if (input.channel !== "email" && !input.body && !input.providerTemplateId) {
    return { error: "Content needs a body or a provider template id", status: 400 };
  }

  await db
    .insert(tables.campaignContent)
    .values({
      campaignId: row.id,
      // channel is the shared notificationChannel pgEnum; locale is a fixed
      // literal enum per-app (makeCampaignTables<L>). Both widened for the
      // same reason as channels above.
      channel: input.channel as never,
      locale: input.locale as never,
      subject: input.subject,
      body: input.body ?? null,
      html: input.html ?? null,
      text: input.text ?? null,
      providerTemplateId: input.providerTemplateId ?? null,
    })
    .onConflictDoUpdate({
      target: [tables.campaignContent.campaignId, tables.campaignContent.channel, tables.campaignContent.locale],
      set: {
        subject: input.subject,
        body: input.body ?? null,
        html: input.html ?? null,
        text: input.text ?? null,
        providerTemplateId: input.providerTemplateId ?? null,
      },
    });

  return { ok: true };
}

export async function sendCampaign(
  deps: CampaignRouteDeps,
  campaignPublicId: string,
  confirmedCount: number,
): Promise<{ queued: number; warning?: string }> {
  const { queued } = await materializeCampaign(deps, campaignPublicId);
  // A send is irreversible. If the audience moved between the admin approving
  // a number and this call, say so rather than quietly mailing a different set.
  if (queued !== confirmedCount) {
    return { queued, warning: `Audience changed: approved ${confirmedCount}, queued ${queued}` };
  }
  return { queued };
}

export async function getAudienceCount(
  deps: CampaignRouteDeps,
  audience: AudienceDef,
): Promise<{ count: number }> {
  const count = await countAudience(deps, audience);
  return { count };
}
