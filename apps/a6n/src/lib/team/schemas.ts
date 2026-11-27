import { z } from "zod";

const id = z.string().min(1).max(64);

export const inviteSchema = z.object({ email: z.email().max(254), name: z.string().trim().min(1).max(200) });
export const memberIdSchema = z.object({ id });
