import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/landing/public-shell";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { ContactForm } from "./contact-form";
import { pageMeta } from "@/lib/landing/meta";

export const metadata: Metadata = pageMeta("Contact | Tiffin Grab", "Ask us about a plan, your area or an order. Add your postal code and we tell you whether we deliver to you.", "/contact");

// Reads live app settings (timezone) for the form — render per request, don't
// prerender at build (keeps the container build DB-free).
export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const { defaultCountry } = await getAppSettings();

  return (
    <div className="tg-wrap tg-section tg-split">
      <div className="tg-stack">
        <PageIntro
          eyebrow="Contact"
          title={<>Ask us <span className="c-accent">anything.</span></>}
          lede="A plan question, a new area, a change to an order. Add your postal code and we will tell you whether we deliver to you."
        />
        <div className="tg-card tg-rows hidden lg:block">
          <Link href="/locations" className="tg-split__row"><strong>Delivery areas</strong><span>Check your postal code on the map</span></Link>
          <Link href="/faq" className="tg-split__row"><strong>Questions we get</strong><span>Pausing, moving days, payment</span></Link>
          <Link href="/menu/weekly" className="tg-split__row"><strong>This week&apos;s menu</strong><span>Every dish, day by day</span></Link>
        </div>
      </div>
      <div className="tg-card tg-form p-6 sm:p-8">
        <ContactForm defaultCountry={defaultCountry} />
      </div>
    </div>
  );
}
