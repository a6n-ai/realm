import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Contact · ${SITE_NAME}`,
  description: "Book an experience or ask about a birthday, school, or team session.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <InteriorPage
      kicker="Say hello"
      title="Book an experience."
      body="Email hello@xplorers.life or WhatsApp us. Tell us the age, the day, and what you want to make."
      cta="Email us"
      href="mailto:hello@xplorers.life"
    />
  );
}
