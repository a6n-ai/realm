import { ClassCard } from "@/components/marketing/class-card";
import { loadPublicClasses } from "@/lib/sessions/public";

export async function HomeClasses({ limit }: { limit: number }) {
  const classes = await loadPublicClasses();
  if (classes.length === 0) {
    return <p className="xl-body">New classes are on their way. Private sessions run Monday to Saturday by arrangement.</p>;
  }
  return (
    <div className="xl-grid">
      {classes.slice(0, limit).map((c) => (
        <ClassCard key={c.publicId} item={c} />
      ))}
    </div>
  );
}
