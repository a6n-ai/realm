import { requireAdmin } from "@/lib/auth/guards";
import { getDiscountPolicy } from "@/lib/services/app-settings.service";
import { KindsForm } from "./form";

export default async function KindsPage() {
  await requireAdmin();
  const policy = await getDiscountPolicy();
  return <KindsForm policy={policy} />;
}
