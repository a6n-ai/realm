import { redirect } from "next/navigation";

// The settings index has no content of its own — the layout owns the tab chrome.
// Land on the first section. The layout's requireAdmin guards the whole subtree.
export default function SettingsPage() {
  redirect("/dashboard/settings/general");
}
