import { contactBody } from "@/lib/public-api/data";
import { publicOrigin } from "@/lib/routing/apex";
import { publicJson } from "@/lib/public-api/respond";
export const dynamic = "force-static";

export function GET() {
  return publicJson(contactBody(publicOrigin()));
}
