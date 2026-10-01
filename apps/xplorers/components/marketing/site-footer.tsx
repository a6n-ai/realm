import Image from "next/image";
import Link from "next/link";
import { CONTACT } from "@/lib/marketing/content";

const LINKS = [
  { href: "/whats-on", label: "What's on" },
  { href: "/kids", label: "Kids" },
  { href: "/families", label: "Families & adults" },
  { href: "/birthdays", label: "Birthdays" },
  { href: "/schools", label: "Schools" },
  { href: "/faq", label: "FAQ" },
];

export function SiteFooter() {
  return (
    <footer className="xl-footer">
      <div className="xl-wrap">
        <div className="xl-footer-main">
          <Image src="/brand/logo-xplorers.png" alt="Xplorers.Life" width={555} height={245} />
          <p className="xl-footer-tag">S.T.E.A.M. · Connection · Belonging</p>
          <nav className="xl-footer-links" aria-label="Footer">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
            <a href={CONTACT.facebook} rel="noopener noreferrer" target="_blank">
              Facebook
            </a>
            <a href={CONTACT.instagram} rel="noopener noreferrer" target="_blank">
              Instagram
            </a>
          </nav>
        </div>
        <div className="xl-footer-legal">
          <span>© {new Date().getFullYear()} Xplorers.Life</span>
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          <Link href="/privacy">Privacy</Link>
          <Link href="/cancellation">Cancellation policy</Link>
          <Link href="/login">Studio login ↗</Link>
        </div>
      </div>
    </footer>
  );
}
