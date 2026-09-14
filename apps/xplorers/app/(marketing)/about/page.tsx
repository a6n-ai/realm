import { SITE_NAME } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: `About · ${SITE_NAME}`,
  description: "Why families join the Science Explorers Club community.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-4xl font-bold tracking-tight">About us</h1>
      <p className="text-muted-foreground mt-4 text-lg text-pretty">
        Xplorers is the Science Explorers Club — a community where families learn together through experiments,
        projects, and play.
      </p>
      <h2 className="mt-10 text-2xl font-semibold">Why join the community?</h2>
      <ul className="mt-4 grid gap-3 text-pretty">
        <li>
          <strong>Inclusive learning.</strong> Programs are designed for all learners, including homeschoolers,
          special-needs families, and multi-generational groups.
        </li>
        <li>
          <strong>Hands-on S.T.E.A.M.</strong> Real-world projects that make curiosity and problem-solving exciting.
        </li>
        <li>
          <strong>Empowering leadership.</strong> Teens, parents, and elders get chances to lead and mentor.
        </li>
        <li>
          <strong>Family bonds.</strong> Shared learning that creates lasting memories.
        </li>
      </ul>
    </article>
  );
}
