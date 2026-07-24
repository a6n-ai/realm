import { redirect } from "next/navigation";

/** Old CRM path — customers live under /me after the shell split. */
export default function LegacySupportRedirect() {
  redirect("/me/support");
}
