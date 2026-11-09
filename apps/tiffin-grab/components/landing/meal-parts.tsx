import { IconTile } from "@/components/customer/kit/icon-tile";
import { makeCategoryLook } from "@/components/customer/meals/category-look";

// "2× Sabzi" -> { count: "2×", name: "Sabzi" }; a part with no count keeps its whole name.
export function splitPart(part: string): { count: string | null; name: string } {
  const m = /^(\d+)\s*[×x]\s*(.+)$/.exec(part.trim());
  return m ? { count: `${m[1]}×`, name: m[2]! } : { count: null, name: part.trim() };
}

/** What comes in a meal size, as compact chips drawn with the app's own category icons
 *  (the customer menu's set). Pass one `look` per list so spare colours stay distinct. */
export function MealParts({ parts, look }: { parts: string[]; look: ReturnType<typeof makeCategoryLook> }) {
  if (parts.length === 0) return null;
  return (
    <ul className="lp-parts" aria-label="In this tiffin">
      {parts.map((c) => {
        const part = splitPart(c);
        const l = look(part.name);
        return (
          <li key={c}>
            <IconTile tint={l.tint} className="lp-parts__icon"><l.icon /></IconTile>
            {part.count ? <><b>{part.count}</b>{" "}</> : null}
            {part.name}
          </li>
        );
      })}
    </ul>
  );
}
