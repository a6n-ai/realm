import { SITE_NAME } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";
import { ClassCard } from "@/components/marketing/class-card";
import { Button, Eyebrow, stagger } from "@/components/marketing/ui";
import { loadPublicClasses } from "@/lib/sessions/public";

export const metadata = buildMetadata({
  title: `Classes · ${SITE_NAME}`,
  description: "Every class at Xplorers.Life, with its next dates. Pick one and book a seat.",
  path: "/classes",
});

export default async function ClassesPage() {
  const classes = await loadPublicClasses();
  return (
    <article>
      <header className="xl-page-hero">
        <div className="xl-wrap">
          <Eyebrow dot style={stagger(0)}>
            Classes
          </Eyebrow>
          <h1 className="xl-display" style={stagger(1)}>
            Find your kind of discovery.
          </h1>
          <p className="xl-lede" style={stagger(2)}>
            Every class we run, with its next dates. Pick one, choose a day and book a seat for each child.
          </p>
        </div>
      </header>
      <section className="xl-wrap xl-section">
        {classes.length === 0 ? (
          <div className="xl-panel xl-stack">
            <p className="xl-body">New classes are on their way. Private sessions run Monday to Saturday by arrangement.</p>
            <div className="xl-row">
              <Button href="/contact">Ask about a private session</Button>
            </div>
          </div>
        ) : (
          <div className="xl-grid">
            {classes.map((c) => (
              <ClassCard key={c.publicId} item={c} />
            ))}
          </div>
        )}
      </section>
    </article>
  );
}
