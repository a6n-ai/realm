import type { Metadata } from "next";
import { Section } from "@/components/marketing/section";
import { ContactForm } from "./contact-form";

export const metadata: Metadata = { title: "Contact — Tiffin Grab", description: "Get in touch — tell us about your tiffin needs and where you're located." };

export default function ContactPage() {
  return (
    <Section className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="gradient-text text-3xl font-semibold tracking-tight">Contact us</h1>
        <p className="text-muted-foreground mt-2">Tell us what you're after. Add your postal code and we'll confirm whether we deliver to your area.</p>
      </div>
      <ContactForm />
    </Section>
  );
}
