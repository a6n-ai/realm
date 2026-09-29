// Duplicate-dish detection. Every alias here came from a real prod duplicate
// (2026-09-28 cleanup): the same dish typed with a Hindi/English spelling variant,
// a word-order swap, or a "(Veg)" suffix. Extend the map when a new pair slips through.
const TOKEN_ALIASES: Record<string, string> = {
  daal: "dal", dhal: "dal", chanadal: "chana dal",
  zeera: "jeera",
  kadhai: "kadai", karahi: "kadai",
  gobhi: "gobi", cabbage: "patta gobi",
  baigan: "baingan", brinjal: "baingan", eggplant: "baingan",
  bhartha: "bharta",
  okra: "bhindi",
  alu: "aloo",
  makhani: "butter",
  palak: "saag",
  kaala: "kala",
  urd: "urad",
  kadi: "kadhi",
  pav: "pao",
  methiwala: "methi",
  dahiwale: "dahi wale",
  vegetable: "veg", vegs: "veg",
};

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z]+/g, " ")
    .replace(/([a-z])\1{2,}/g, "$1") // "Kadiii" -> "Kadi"
    .split(" ")
    .filter(Boolean)
    .flatMap((t) => (TOKEN_ALIASES[t] ?? t).split(" "));
}

/** Two dishes with the same key are the same dish, whatever the spelling or word order. */
export function dishNameKey(name: string): string {
  return [...new Set(tokens(name))].sort().join(" ");
}

function levenshtein(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! : 1 + Math.min(prev[j - 1]!, prev[j]!, cur[j - 1]!);
    }
    prev = cur;
  }
  return prev[b.length]!;
}

// Words that pad a name without changing the dish: "Rongi" vs "Rongi Dal",
// "Chicken Kofta" vs "Chicken Kofta Curry". Any other extra word ("Chicken" vs
// "Chicken Curry") is a different dish, so plain containment would flag half the catalog.
const FILLER = new Set(["dal", "curry", "sabzi", "wala"]);

// 0..1. Edit distance catches typos; filler-only difference catches the rest.
function score(a: string, b: string): number {
  if (a === b) return 1;
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  const [small, big] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  const extra = [...big].filter((t) => !small.has(t));
  const fillerOnly = [...small].every((t) => big.has(t)) && extra.every((t) => FILLER.has(t)) ? 0.9 : 0;
  const edit = 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  return Math.max(fillerOnly, edit);
}

const THRESHOLD = 0.85;

export function findSimilarDishes<T extends { name: string }>(name: string, dishes: T[], limit = 3): T[] {
  const key = dishNameKey(name);
  if (!key) return [];
  return dishes
    .map((d) => ({ d, s: score(key, dishNameKey(d.name)) }))
    .filter((x) => x.s >= THRESHOLD)
    .sort((x, y) => y.s - x.s)
    .slice(0, limit)
    .map((x) => x.d);
}
