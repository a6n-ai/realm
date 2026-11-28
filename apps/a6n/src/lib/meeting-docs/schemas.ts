import { z } from "zod";

const id = z.string().min(1).max(64);
const mode = z.enum(["edit", "view"]);
const time = z.number().int();
const shareToken = z.string().max(64);

export const startDocSchema = z.object({ inquiryId: id, localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export const docIdSchema = z.object({ docId: id });
export const listDocsSchema = z.object({ inquiryId: id });
export const createShareSchema = z.object({ docId: id, mode, expiresAt: time });
export const shareExpirySchema = z.object({ shareId: id, expiresAt: time });
export const shareIdSchema = z.object({ shareId: id });
export const defaultTtlSchema = z.object({ docId: id, seconds: time });
export const openShareSchema = z.object({ token: shareToken });
export const guestTokenSchema = z.object({ token: shareToken, name: z.string().trim().min(1).max(60) });
