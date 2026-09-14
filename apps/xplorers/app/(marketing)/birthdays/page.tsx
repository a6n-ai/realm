import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Birthdays · ${SITE_NAME}`,
  description: "From $48/child · min 15 or $58/child · min 12.",
  path: "/birthdays",
});

export default function BirthdaysPage() {
  return (
    <InteriorPage
      kicker="Birthdays"
      title="Make it a day to remember."
      body="From $48 a child, minimum 15. Or $58 a child, minimum 12. The benches are yours."
      cta="Enquire"
    />
  );
}
