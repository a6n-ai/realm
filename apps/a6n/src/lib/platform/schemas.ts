import { z } from "zod";

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(80);
const person = { email: z.email().max(254), ownerName: z.string().trim().min(1).max(200) };
export const createOrgSchema = z.object({ name, slug: z.string().trim().min(1).max(40), ownerEmail: person.email, ownerName: person.ownerName });
export const renameOrgSchema = z.object({ id, name });
export const addOwnerSchema = z.object({ id, email: person.email, name: person.ownerName });
export const setActiveOrgSchema = z.object({ organizationId: id });
