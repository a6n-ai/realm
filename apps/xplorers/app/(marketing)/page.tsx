import Link from "next/link";
import { Button } from "@foundry/ui/button";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `${SITE_NAME} · ${SITE_TAGLINE}`,
  description:
    "Inclusive hands-on S.T.E.A.M. classes, workshops, stage shows, family days, and birthday parties for every learner.",
  path: "/",
});

const REASONS = [
  {
    title: "Inclusive learning",
    body: "Programs for all learners, including homeschoolers, special-needs families, and multi-generational groups.",
  },
  {
    title: "Hands-on S.T.E.A.M.",
    body: "Real-world projects that make curiosity and problem-solving exciting and memorable.",
  },
  {
    title: "Leadership for everyone",
    body: "Teens, parents, and elders get chances to lead and mentor inside the community.",
  },
  {
    title: "Stronger family bonds",
    body: "Shared experiments and projects that become lasting memories.",
  },
];

const TESTIMONIALS = [
  {
    quote: "I love Auntie Jonn. She’s our Ms Fritzl. I have been having fun with her for years. I love her because she’s very patient and fun!",
    name: "Constantine",
    detail: "7yo",
  },
  {
    quote: "The sessions are very fun. The projects are all very interesting. Auntie Jonn has been very helpful and patient.",
    name: "Kaedi",
    detail: "8yo",
  },
  {
    quote: "I like making lip balm with Auntie Jonn. Now I can make so many to give to my friends.",
    name: "Noelle",
    detail: "3yo",
  },
  {
    quote: "Auntie Jonnansical is very patient with all the students and clear with her instructions. The lessons are often well organized and planned.",
    name: "Jessica & Judy",
    detail: "15 and mum",
  },
];

export default function HomePage() {
  return (
    <div>
      <section className="mx-auto max-w-5xl px-4 py-16 md:py-24">
        <p className="text-primary text-sm font-semibold tracking-wide uppercase">Science Explorers Club</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-balance md:text-6xl">
          Hands-on S.T.E.A.M. for every learner
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-lg text-pretty">
          Classes, workshops, stage shows, family days, and birthday parties — built so families grow closer while they
          learn.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/programs">See programs</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/signup">Create a family account</Link>
          </Button>
        </div>
      </section>

      <section className="bg-muted/60 py-16">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 md:grid-cols-2">
          {REASONS.map((r) => (
            <article key={r.title} className="bg-card rounded-xl border p-6">
              <h2 className="text-lg font-semibold">{r.title}</h2>
              <p className="text-muted-foreground mt-2 text-sm text-pretty">{r.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-16">
        <h2 className="text-2xl font-bold">What families say</h2>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          {TESTIMONIALS.map((t) => (
            <blockquote key={t.name} className="bg-card rounded-xl border p-6">
              <p className="text-pretty">&ldquo;{t.quote}&rdquo;</p>
              <footer className="text-muted-foreground mt-4 text-sm">
                {t.name} / {t.detail}
              </footer>
            </blockquote>
          ))}
        </div>
      </section>
    </div>
  );
}
