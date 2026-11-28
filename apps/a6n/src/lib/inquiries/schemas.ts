import { z } from "zod";
import { LOST_REASONS, OPEN_STAGES, STAGES } from "./stages";

const id = z.string().min(1).max(64);
const text = (max: number) => z.string().max(max);
const optionalText = (max: number) => z.string().max(max).nullish();
// E.164 from the phone input, or a free-text number already stored or sent by another source; junk like "abc" is refused.
const phone = z.string().max(50).regex(/^(|(?=.*\d)\+?[\d\s().-]{3,})$/, "Enter a valid phone number").nullish();
const time = z.number().int().finite();

export const createInquirySchema = z.object({
  source: z.string().min(1).max(50),
  subSource: z.string().max(50).nullish(),
  contactName: optionalText(200),
  phone,
  email: z.union([z.literal(""), z.email().max(254)]).nullish(),
  company: optionalText(200),
  requirements: optionalText(5000),
  nextFollowUpAt: time,
});

export const changeStageSchema = z.object({
  id,
  from: z.enum(STAGES),
  to: z.enum(STAGES),
  lostReason: z.enum(LOST_REASONS).nullish(),
});
export const reopenSchema = z.object({ id, stage: z.enum(OPEN_STAGES), nextFollowUpAt: time });
export const addActivitySchema = z.object({ id, type: z.enum(["note", "call", "whatsapp", "email"]), note: text(5000) });
export const setFollowUpSchema = z.object({ id, at: time });
export const claimSchema = z.object({ id });
export const assignSchema = z.object({ id, fromOwnerId: id.nullable(), toOwnerId: id });
export const updateContactSchema = z.object({
  id,
  contactName: optionalText(200),
  phone,
  email: z.union([z.literal(""), z.email().max(254)]).nullish(),
  requirements: optionalText(5000),
});

export const listInquiriesSchema = z.object({
  view: z.enum(["mine", "unassigned", "all"]).default("mine"),
  q: z.string().max(200).optional(),
  stage: z.enum(STAGES).optional(),
  source: id.optional(),
  owner: id.optional(),
  due: z.literal("1").optional(),
  page: z.number().int().min(1).max(10_000).default(1),
});
export const getInquirySchema = z.object({ id });
export const searchCompaniesSchema = z.object({ q: z.string().max(200) });
export const listBoardSchema = listInquiriesSchema.omit({ stage: true, page: true });
