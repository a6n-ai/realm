import { redirect } from "next/navigation";

// Placeholder until the People table replaces the members page.
export default function PeopleRedirect() {
  redirect("/dashboard/organization/members");
}
