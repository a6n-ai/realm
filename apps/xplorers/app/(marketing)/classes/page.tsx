import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Classes & workshops · Xplorers",
  description: "Private and group S.T.E.A.M. classes plus corporate workshops.",
  path: "/classes",
});

export default function ClassesPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 md:px-6">
      <h1 className="text-4xl font-extrabold">Classes & workshops</h1>
      <p className="mt-4 text-lg text-[var(--navy)]/75">
        Engaging private and group classes, plus corporate workshops, with hands-on S.T.E.A.M. for every age.
      </p>
      <p className="mt-6 text-[var(--navy)]/70">
        Booking, schedules, and class catalogs land here next. For now, reach out on the contact page and we’ll place
        you.
      </p>
    </article>
  );
}
