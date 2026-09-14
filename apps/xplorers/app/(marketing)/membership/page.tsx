import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Membership · ${SITE_NAME}`,
  description: "Come back. Pick a bench. Open to everyone.",
  path: "/membership",
});

export default function MembershipPage() {
  return (
    <InteriorPage
      kicker="Membership"
      title="Come as you are."
      body="Drop in to Kids Club from $35 an hour. Evening sessions for adults. No curriculum. Repeat as needed."
      cta="See what's on"
      href="/whats-on"
    />
  );
}
