import type { Metadata } from "next";
import { UtensilsCrossed } from "lucide-react";
import { Section } from "@/components/marketing/section";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact — Tiffin Grab", description: "Get in touch — tell us about your tiffin needs and where you're located." };

// Reads live app settings (timezone) for the form — render per request, don't
// prerender at build (keeps the container build DB-free).
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const { defaultCountry } = await getAppSettings();

  return (
    <Section className="space-y-10">
      <div className="max-w-2xl">
        <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">Get in touch</p>
        <h1 className="m-0 mb-2.5 text-[clamp(28px,5vw,52px)] font-bold tracking-[-1.5px]">Contact us.</h1>
        <p className="text-muted-foreground mt-2">Tell us what you&apos;re after. Add your postal code and we&apos;ll confirm whether we deliver to your area.</p>
      </div>
      <ContactForm defaultCountry={defaultCountry} />
      <div className="border-foreground max-w-2xl space-y-4 border-t-[1.5px] pt-10">
        <div className="flex items-center gap-3">
          <UtensilsCrossed className="animate-float text-muted-foreground size-7" />
          <h2 className="text-2xl font-bold tracking-[-1px]">About Tiffin Grab</h2>
        </div>
        <p className="text-muted-foreground">
          Tiffin Grab brings home-style, customizable meals to the Greater Toronto Area. We believe
          a good tiffin should fit your diet, your schedule, and your budget — not the other way
          around. Every plan is built by you: nutrition baseline, meal size, delivery rhythm, and
          commitment length.
        </p>
        <p className="text-muted-foreground">
          We cook balanced thalis and bowls in small batches and deliver them on slot windows matched
          to your neighbourhood across eleven GTA regions.
        </p>
      </div>
    </Section>
  );
}
