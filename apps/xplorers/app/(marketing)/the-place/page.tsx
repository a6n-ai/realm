import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `The Place · ${SITE_NAME}`,
  description: "A maker studio in Singapore. Indoor and outdoor. Step-free entry.",
  path: "/the-place",
});

export default function ThePlacePage() {
  return (
    <InteriorPage
      kicker="The Place"
      title="A maker studio in Singapore."
      body="Indoor and outdoor. Nearest MRT, parking, step-free entry. Wheelchair-accessible sessions. Caretakers join free."
      cta="How we make this work"
      href="/faq"
    />
  );
}
