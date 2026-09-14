import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Privacy · ${SITE_NAME}`,
  description: "How Xplorers holds your details.",
  path: "/privacy",
  noIndex: true,
});

export default function PrivacyPage() {
  return (
    <InteriorPage
      kicker="Privacy"
      title="Your details stay with us."
      body="We use your email or WhatsApp to send session times. We do not sell lists. Ask us to delete a record and we will."
      cta="Say hello"
    />
  );
}
