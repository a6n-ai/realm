import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `FAQ · ${SITE_NAME}`,
  description: "Caretakers join free. Wheelchair-accessible sessions. Move, snack or take a break.",
  path: "/faq",
});

export default function FaqPage() {
  return (
    <InteriorPage
      kicker="FAQ"
      title="How we make this work."
      body="Caretakers join free. Wheelchair-accessible sessions. Move, snack or take a break whenever you need. PayNow accepted."
      cta="Book an experience"
    />
  );
}
