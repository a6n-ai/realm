import { agentSkillsIndex } from "@/lib/public-api/discovery";
import { publicJson } from "@/lib/public-api/respond";
import { publicOrigin } from "@/lib/routing/apex";

export const dynamic = "force-static";

export const GET = async () => publicJson(await agentSkillsIndex(publicOrigin()));
