import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Kids · ${SITE_NAME}`,
  description: "Science, making, camps and after-school.",
  path: "/kids",
});

export default function KidsPage() {
  return (
    <InteriorPage
      kicker="Kids"
      title="Build a machine out of cardboard."
      body="Science, making, camps and after-school. Take it home. Age 5–12, drop-off from $68."
      cta="See kids sessions"
      href="/whats-on"
    />
  );
}
