type Kind = "local" | "session";

/** Browser storage that never throws (private mode, blocked site data): reads fall back, writes are dropped. */
export function safeStorage(kind: Kind) {
  const area = () => (kind === "local" ? localStorage : sessionStorage);
  const get = (key: string, fallback: string | null = null): string | null => {
    try { return area().getItem(key); } catch { return fallback; }
  };
  return {
    get,
    set(key: string, value: string) { try { area().setItem(key, value); } catch { /* storage unavailable */ } },
    remove(key: string) { try { area().removeItem(key); } catch { /* storage unavailable */ } },
    getJson<T>(key: string, fallback: T): T {
      try {
        const raw = area().getItem(key);
        return raw == null ? fallback : (JSON.parse(raw) as T);
      } catch { return fallback; }
    },
    setJson(key: string, value: unknown) { try { area().setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } },
  };
}

export const localStore = safeStorage("local");
export const sessionStore = safeStorage("session");
