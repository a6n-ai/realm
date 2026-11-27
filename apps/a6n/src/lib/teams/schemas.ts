import { z } from "zod";

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(64);
export const createTeamSchema = z.object({ name });
export const renameTeamSchema = z.object({ id, name });
export const teamIdSchema = z.object({ id });
export const teamMemberSchema = z.object({ teamId: id, userId: id });
