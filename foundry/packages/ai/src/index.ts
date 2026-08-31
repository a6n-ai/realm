import { z } from "zod";

/**
 * Monarch AI primitives live in Foundry, not in Realm and not in a second
 * packages repo. Apps (Monarch) import `@foundry/ai`; they do not vendor models.
 */
export const agentModelSchema = z.object({
  provider: z.enum(["openai", "anthropic", "custom"]),
  id: z.string().min(1),
});
export type AgentModel = z.infer<typeof agentModelSchema>;

export const agentToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  inputSchema: z.record(z.string(), z.unknown()).optional(),
});
export type AgentTool = z.infer<typeof agentToolSchema>;
