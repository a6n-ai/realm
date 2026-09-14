import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Parties · Xplorers",
  description: "Science-themed birthday parties and gatherings.",
  path: "/parties",
});

export default function PartiesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <h1 className="text-4xl font-extrabold">Birthday parties & gatherings</h1>
      <p className="mt-4 text-lg text-[var(--navy)]/75">
        Science-themed celebrations filled with interactive experiments and creative projects — plus immersive
        experiential learning like escape rooms and gamified challenges.
      </p>
    </article>
  );
}
