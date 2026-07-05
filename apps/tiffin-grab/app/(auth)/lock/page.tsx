import { redirect } from "next/navigation";

// Lock/unlock is now folded into the single /login screen (PIN mode). Kept as a
// redirect so existing links and any in-flight navigations still resolve.
export default function LockPage() {
  redirect("/login");
}
