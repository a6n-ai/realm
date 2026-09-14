import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Schools & Companies · ${SITE_NAME}`,
  description: "Custom workshops and team experiences. School programmes run under Science Wing.",
  path: "/schools",
});

export default function SchoolsPage() {
  return (
    <InteriorPage
      kicker="08 / School programmes run under Science Wing"
      title="Something for teams too."
      body="Custom workshops and team experiences. Schools, corporate workshops, one structure, two hours."
      cta="Work with us"
    />
  );
}
