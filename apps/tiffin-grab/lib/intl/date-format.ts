// Building an Intl.DateTimeFormat is expensive (it was ~40% of a calendar page's CPU);
// formatting with an existing one is cheap. Formatters are immutable, so share them.
// ponytail: unbounded map; keys are a handful of locale/option/timezone combos.
const cache = new Map<string, Intl.DateTimeFormat>();

export function dateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(Object.entries(options).sort(([a], [b]) => (a < b ? -1 : 1)))}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, options);
    cache.set(key, f);
  }
  return f;
}
