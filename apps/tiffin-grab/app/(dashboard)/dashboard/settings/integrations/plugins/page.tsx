import { redirect } from "next/navigation";

/** Old Integrations → Plugins tab URL. */
export default function IntegrationsPluginsRedirect() {
  redirect("/dashboard/settings/integrations");
}
