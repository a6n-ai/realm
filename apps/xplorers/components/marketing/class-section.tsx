import type { SessionCategory } from "@/db/schema/studio";
import { ClassCard } from "@/components/marketing/class-card";
import { SectionHeading } from "@/components/marketing/ui";
import { loadPublicClasses } from "@/lib/sessions/public";

export async function ClassSection({
  eyebrow,
  title,
  categories,
}: {
  eyebrow: string;
  title: string;
  categories: SessionCategory[];
}) {
  const classes = (await loadPublicClasses()).filter((c) => categories.includes(c.category));
  return (
    <section className="xl-wrap xl-section">
      <SectionHeading eyebrow={eyebrow} title={title} size="md" />
      {classes.length === 0 ? (
        <p className="xl-body" style={{ marginTop: 28 }}>
          New classes are on their way. Private sessions run Monday to Saturday by arrangement.
        </p>
      ) : (
        <div className="xl-grid" style={{ marginTop: 28 }}>
          {classes.map((c) => (
            <ClassCard key={c.publicId} item={c} />
          ))}
        </div>
      )}
    </section>
  );
}
