import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `What's On · ${SITE_NAME}`,
  description: "Ages 5 to 75 on one board. Pick a bench.",
  path: "/whats-on",
});

export default function WhatsOnPage() {
  return (
    <InteriorPage
      kicker="Calendar"
      title="What's on the benches."
      body="Ages 5 to 75 on one board. Pick a bench. Prices are on the session. Drop-off, stay, or come after work."
      cta="Book an experience"
    />
  );
}
