import { z } from "zod";

const id = z.string().min(1).max(64);
const key = z.string().min(1).max(50);
const label = z.string().trim().min(1).max(100);

export const createSourceSchema = z.object({ key, label });
export const renameSourceSchema = z.object({ id, label });
export const setActiveSchema = z.object({ id, active: z.boolean() });
export const addSubsourceSchema = z.object({ sourceId: id, key, label });
