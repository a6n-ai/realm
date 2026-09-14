import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Community · ${SITE_NAME}`,
  description: "Evening sessions, new workshops, and the occasional nature walk.",
  path: "/community",
});

export default function CommunityPage() {
  return (
    <InteriorPage
      kicker="09 / There's a group chat."
      title="There's a group chat."
      body="Evening sessions, new workshops, and the occasional nature walk. WhatsApp or email."
      cta="Join the community"
      href="/#community"
    />
  );
}
