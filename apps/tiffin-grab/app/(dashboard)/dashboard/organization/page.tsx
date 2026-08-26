import { redirect } from "next/navigation";

export default function OrganizationIndexRedirect() {
  redirect("/dashboard/organization/users");
}
