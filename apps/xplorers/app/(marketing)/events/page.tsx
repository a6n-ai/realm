import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Events · Xplorers",
  description: "Stage shows, pop-up markets, and family days.",
  path: "/events",
});

export default function EventsPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <h1 className="text-4xl font-extrabold">Shows, markets & family days</h1>
      <p className="mt-4 text-lg text-[var(--navy)]/75">
        Live science shows, custom events, and educational booths for markets, fairs, and family-focused days.
      </p>
      <p className="mt-6 text-[var(--navy)]/70">A public calendar of upcoming dates will live on this page.</p>
    </article>
  );
}
