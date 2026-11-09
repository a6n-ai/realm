import { publicJson } from "@/lib/public-api/respond";

export const dynamic = "force-static";

export const GET = () => publicJson({ status: "ok" });
