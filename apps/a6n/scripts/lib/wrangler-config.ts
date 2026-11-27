// Pure: no Node or Workers imports, so the vitest workers pool can load it.
export interface D1Binding {
  binding: string;
  name: string;
  migrationsDir: string;
}

interface RawConfig {
  d1_databases?: { binding: string; database_name: string; migrations_dir?: string }[];
}

// shortcut: trailing-comma regex can touch a string value containing ",}" or ",]"; use jsonc-parser if that ever happens.
export function stripJsonc(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i++;
      out += "\n";
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new Error("unterminated block comment in wrangler config");
      i = end + 1;
    } else {
      out += c;
    }
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

export function parseWranglerJsonc(text: string): { d1: D1Binding[] } {
  const raw = JSON.parse(stripJsonc(text)) as RawConfig;
  return {
    d1: (raw.d1_databases ?? []).map((d) => ({
      binding: d.binding,
      name: d.database_name,
      migrationsDir: d.migrations_dir ?? "migrations",
    })),
  };
}
