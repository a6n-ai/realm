import { z } from "zod";

const name = z.string().trim().min(1).max(32);
export const roleNameSchema = z.object({ name });
export const roleSchema = z.object({ name, permissions: z.array(z.string().max(64)).max(64) });
