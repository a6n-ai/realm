import { SITE_NAME } from "@/lib/brand";
import { InteriorPage } from "@/components/marketing/interior-page";
import { CONTACT } from "@/lib/marketing/content";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Contact · ${SITE_NAME}`,
  description: "Book an experience or ask about a birthday, school, or team session.",
  path: "/contact",
});

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ class?: string | string[] }> }) {
  const { class: rawClass } = await searchParams;
  const className = Array.isArray(rawClass) ? rawClass[0] : rawClass;
  const subject = className ? `?subject=${encodeURIComponent(`Enquiry: ${className}`)}` : "";
  return (
    <InteriorPage
      kicker="Say hello"
      title={className ? `Ask about ${className}.` : "Book an experience."}
      body={`Email ${CONTACT.email} or WhatsApp us. Tell us the age, the day, and what you want to make.`}
      cta="Email us"
      href={`mailto:${CONTACT.email}${subject}`}
    />
  );
}
