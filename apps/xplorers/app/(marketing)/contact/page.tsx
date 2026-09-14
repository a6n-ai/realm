import Link from "next/link";
import { Button } from "@foundry/ui/button";
import { SITE_NAME } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Contact · ${SITE_NAME}`,
  description: "Get in touch with Science Explorers Club.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Contact</h1>
      <p className="text-muted-foreground mt-4 text-lg text-pretty">
        A contact form lands with the first feature pass. Until then, create a family account or email us from the
        live site.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/signup">Create an account</Link>
        </Button>
        <Button asChild variant="outline">
          <a href="https://xplorers.life/" rel="noreferrer">
            xplorers.life
          </a>
        </Button>
      </div>
    </article>
  );
}
