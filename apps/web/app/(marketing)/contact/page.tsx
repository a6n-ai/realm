import type { Metadata } from "next";
import { tzToDefaultCountry } from "@tiffin/commons";
import { Section } from "@/components/marketing/section";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact — Tiffin Grab", description: "Get in touch — tell us about your tiffin needs and where you're located." };

// Reads live app settings (timezone) for the form — render per request, don't
// prerender at build (keeps the container build DB-free).
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const { timezone } = await getAppSettings();
  const defaultCountry = tzToDefaultCountry(timezone);

  return (
    <Section className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Contact us</h1>
        <p className="text-muted-foreground mt-2">Tell us what you're after. Add your postal code and we'll confirm whether we deliver to your area.</p>
      </div>
      <ContactForm defaultCountry={defaultCountry} />
    </Section>
  );
}
