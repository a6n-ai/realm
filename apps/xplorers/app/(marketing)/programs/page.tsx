import Link from "next/link";
import { SITE_NAME } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `Programs · ${SITE_NAME}`,
  description: "Classes, workshops, stage shows, family days, birthday parties, and experiential learning.",
  path: "/programs",
});

const PROGRAMS = [
  {
    title: "Classes & workshops",
    href: "/classes",
    body: "Private and group classes plus corporate workshops with hands-on S.T.E.A.M. for all ages.",
  },
  {
    title: "Stage shows & events",
    href: "/events",
    body: "Live science shows and custom events with demonstrations and interactive activities.",
  },
  {
    title: "Pop-up markets & family days",
    href: "/events",
    body: "Educational booths and activities for markets, fairs, and family-focused events.",
  },
  {
    title: "Birthday parties & gatherings",
    href: "/parties",
    body: "Science-themed celebrations with experiments and creative projects.",
  },
  {
    title: "Experiential learning",
    href: "/parties",
    body: "Escape rooms and gamified activities that challenge critical thinking.",
  },
];

export default function ProgramsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">Programs</h1>
      <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
        Educational services for families, schools, and community groups. Booking tools come next — this is the
        public catalog.
      </p>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {PROGRAMS.map((p) => (
          <Link key={p.title} href={p.href} className="bg-card hover:border-primary rounded-xl border p-6 transition-colors">
            <h2 className="text-lg font-semibold">{p.title}</h2>
            <p className="text-muted-foreground mt-2 text-sm text-pretty">{p.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
