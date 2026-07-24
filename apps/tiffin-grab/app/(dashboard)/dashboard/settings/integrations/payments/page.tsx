import { redirect } from "next/navigation";

/** Old Integrations → Payment tab URL; Payment is now its own Settings card. */
export default function IntegrationsPaymentsRedirect() {
  redirect("/dashboard/settings/payments");
}
