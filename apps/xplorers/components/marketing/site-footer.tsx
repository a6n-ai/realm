import Image from "next/image";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { CONTACT } from "@/lib/marketing/content";
import { Button } from "@/components/marketing/ui";
import { loadPublicClasses } from "@/lib/sessions/public";

const PAGES = [
  { href: "/whats-on", label: "What's on" },
  { href: "/membership", label: "Membership" },
  { href: "/birthdays", label: "Birthdays" },
  { href: "/schools", label: "Schools & teams" },
  { href: "/the-place", label: "Our little space" },
  { href: "/faq", label: "FAQ" },
];

export async function SiteFooter() {
  const classes = await loadPublicClasses();
  return (
    <footer id="visit" className="xl-footer">
      <div className="xl-wrap">
        <div className="xl-footer-cta">
          <div className="xl-stack" style={{ gap: 12 }}>
            <h2 className="xl-footer-title">
              Come make <span className="xl-footer-mark">something.</span>
            </h2>
            <p className="xl-footer-lede">
              Tell us the age, the day and what you want to make. We&rsquo;ll help you find the right session.
            </p>
          </div>
          <div className="xl-row">
            <Button href="/contact" variant="success" icon="arrow-up-right">
              Let&rsquo;s chat
            </Button>
            <Button href="/whats-on" variant="ghost-inverse">
              See what&rsquo;s on
            </Button>
          </div>
        </div>

        <div className="xl-footer-grid">
          <section aria-labelledby="xl-ft-visit">
            <h3 id="xl-ft-visit" className="xl-footer-head">
              Visit
            </h3>
            <address className="xl-footer-address">
              <MapPin size={18} aria-hidden />
              <span>{CONTACT.address.replaceAll(" · ", "\n")}</span>
            </address>
            <a className="xl-footer-link" href={CONTACT.maps} target="_blank" rel="noopener noreferrer">
              Get directions ↗
            </a>
          </section>

          <nav aria-labelledby="xl-ft-programmes">
            <h3 id="xl-ft-programmes" className="xl-footer-head">
              Classes
            </h3>
            <ul className="xl-footer-list">
              {classes.slice(0, 7).map((c) => (
                <li key={c.publicId}>
                  <Link className="xl-footer-link" href={`/classes/${c.publicId}`}>
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="xl-ft-explore">
            <h3 id="xl-ft-explore" className="xl-footer-head">
              Explore
            </h3>
            <ul className="xl-footer-list">
              {PAGES.map((l) => (
                <li key={l.href}>
                  <Link className="xl-footer-link" href={l.href}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="xl-ft-hello">
            <h3 id="xl-ft-hello" className="xl-footer-head">
              Say hello
            </h3>
            <ul className="xl-footer-list">
              <li>
                <a className="xl-footer-link" href={`mailto:${CONTACT.email}`}>
                  {CONTACT.email}
                </a>
              </li>
              <li>
                <a className="xl-footer-link" href={CONTACT.instagram} target="_blank" rel="noopener noreferrer">
                  Instagram ↗
                </a>
              </li>
              <li>
                <a className="xl-footer-link" href={CONTACT.facebook} target="_blank" rel="noopener noreferrer">
                  Facebook ↗
                </a>
              </li>
            </ul>
          </section>
        </div>

        <div className="xl-footer-base">
          <Link href="/" className="xl-footer-logo" aria-label="Xplorers.Life home">
            <Image src="/brand/logo-xplorers.png" alt="" width={555} height={245} />
          </Link>
          <p className="xl-footer-tag">S.T.E.A.M. · Connection · Belonging</p>
          <div className="xl-footer-legal">
            <span>© {new Date().getFullYear()} Xplorers.Life</span>
            <Link className="xl-footer-link" href="/privacy">
              Privacy
            </Link>
            <Link className="xl-footer-link" href="/cancellation">
              Cancellation policy
            </Link>
            <Link className="xl-footer-link" href="/login">
              Studio login
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
