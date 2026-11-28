import { z } from "zod";
import { KINDS } from "./meta";

const id = z.string().min(1).max(64);

export const createDocSchema = z.object({ kind: z.enum(KINDS).optional() });
export const setKindSchema = z.object({ docId: id, kind: z.enum(KINDS) });
export const emptyTrashSchema = z.object({});
// the title's limits are the service's: it trims first
export const renameDocSchema = z.object({ docId: id, title: z.string().max(1000) });
export const memberSchema = z.object({ docId: id, userId: id });
export const setMemberSchema = z.object({ docId: id, userId: id, mode: z.enum(["edit", "view"]) });
