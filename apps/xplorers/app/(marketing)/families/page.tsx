import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Families & Adults · ${SITE_NAME}`,
  description: "Workshops, crafting, making, community.",
  path: "/families",
});

export default function FamiliesPage() {
  return (
    <InteriorPage
      kicker="Families & Adults"
      title="Come after work. Make something."
      body="Workshops, crafting, making, community. Drink included on Wednesday nights. From $58."
      cta="See adult sessions"
      href="/whats-on"
    />
  );
}
