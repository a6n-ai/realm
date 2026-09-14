import Link from "next/link";
import { SITE_NAME } from "@/lib/brand";

export function SiteFooter() {
  return (
    <footer className="border-t px-4 py-10">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-semibold">{SITE_NAME}</p>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            Science Explorers Club — inclusive hands-on S.T.E.A.M. for families, homeschoolers, and community groups.
          </p>
        </div>
        <nav className="text-muted-foreground grid gap-2 text-sm">
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/programs" className="hover:text-foreground">
            Programs
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
