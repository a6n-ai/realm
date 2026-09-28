import { normalizeItems, type CategoryUnit, type CustomMealItem } from "./composition";

const DIET = String.raw`(?:main\s+)?(non[- ]?veg|veg)(?:\s+main)?`;
const DISH = String.raw`(?:curry|curries|sabzi|chicken)`;
// "1 Non-Veg(12oz) Curry", "2 Veg Curries [8oz]", "1 Veg(8oz) Sabzi". Dal/daal is deliberately absent:
// the spec only maps Veg/Non-Veg to sabzi, so a dal pick goes to manual mapping.
const SABZI = new RegExp(String.raw`^(\d+)\s*${DIET}(?:\s+${DISH})?\s*[(\[]\s*(\d+(?:\.\d+)?)\s*oz\s*[)\]](?:\s*${DISH})?$`, "i");
// "2 12oz NON VEG CURRIES", "1 8oz VEG MAIN CURRY".
const SABZI_SIZE_FIRST = new RegExp(String.raw`^(\d+)\s+(\d+(?:\.\d+)?)\s*oz\s+${DIET}\s+${DISH}$`, "i");
const ROTI = /^(\d+)\s*rotis?(?:\s+only)?$/i;
const RICE = /^(\d+)\s*rice(?:\s+(?:containers?|boxes?))?$/i;

// "Custom Meal - 1 Non-Veg(12oz) + 2 Veg(8oz) + 4 Rotis + 1 Rice" -> items. Older names use
// " - " between groups and pad with trailing dashes; those split like "+".
// null when any segment isn't one of those shapes: staff map those by hand.
export function parseCustomMealName(text: string, units: Map<string, CategoryUnit>): CustomMealItem[] | null {
  const body = text.replace(/^\s*custom meal\s*-\s*/i, "").trim();
  if (!body) return null;
  const sabziSize = units.get("sabzi")?.tuUnitSize;
  const rotiSize = units.get("roti")?.tuUnitSize;
  const riceSize = units.get("rice")?.tuUnitSize;
  if (!sabziSize || !rotiSize || !riceSize) throw new Error("sabzi/roti/rice categories missing");

  const sabzi: CustomMealItem[] = [];
  let roti = 0;
  let rice = 0;
  // Split on "+" and on dashes touching whitespace, so "Non-Veg" stays whole.
  const segs = body.split(/\+|\s-+|-+\s|-+$/).map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return null;
  for (const seg of segs) {
    let m: RegExpMatchArray | null;
    let pick: { n: string; diet: string; oz: string } | null = null;
    if ((m = seg.match(SABZI))) pick = { n: m[1], diet: m[2], oz: m[3] };
    else if ((m = seg.match(SABZI_SIZE_FIRST))) pick = { n: m[1], oz: m[2], diet: m[3] };
    if (pick) {
      const planKey = /non/i.test(pick.diet) ? "non-veg" : "veg";
      for (let i = 0; i < Number(pick.n); i++) sabzi.push({ category: "sabzi", planKey, tuAmount: Number(pick.oz) / sabziSize });
    } else if ((m = seg.match(ROTI))) roti += Number(m[1]);
    else if ((m = seg.match(RICE))) rice += Number(m[1]);
    else return null;
  }
  const planKey = sabzi.some((s) => s.planKey === "non-veg") ? "non-veg" : "veg";
  const items = [...sabzi];
  if (roti) items.push({ category: "roti", planKey, tuAmount: roti / rotiSize });
  if (rice) items.push({ category: "rice", planKey, tuAmount: rice / riceSize });
  const normalized = normalizeItems(items, units);
  return normalized.length ? normalized : null;
}
