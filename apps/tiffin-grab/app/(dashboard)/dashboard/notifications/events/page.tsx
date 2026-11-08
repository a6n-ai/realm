import { permanentRedirect } from "next/navigation";

export default function EmailEventsRedirect() {
  permanentRedirect("/dashboard/settings/email-tracking");
}
