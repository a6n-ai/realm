export interface CompatWarning {
  line: number;
  property: string;
  clients: string;
}

// ponytail: hand-kept subset of caniemail.com's well-known gaps — the high-signal
// ones react.email surfaces. Add a rule when a real template trips an untracked
// property; not worth pulling the full caniemail dataset for a dozen cases.
const RULES: { re: RegExp; property: string; clients: string }[] = [
  { re: /border-radius\s*:/i, property: "border-radius", clients: "Outlook" },
  { re: /box-shadow\s*:/i, property: "box-shadow", clients: "Gmail, Outlook, Yahoo! Mail" },
  { re: /overflow(?:-x|-y)?\s*:/i, property: "overflow", clients: "Outlook" },
  { re: /display\s*:\s*(?:flex|grid|inline-flex|inline-grid)/i, property: "flex/grid layout", clients: "Outlook" },
  { re: /(?:^|[;"'\s])gap\s*:/i, property: "gap", clients: "Outlook, Gmail" },
  { re: /position\s*:\s*(?:absolute|fixed|relative|sticky)/i, property: "position", clients: "most clients" },
  { re: /background-image\s*:/i, property: "background-image", clients: "Outlook (partial)" },
  { re: /\btransform\s*:/i, property: "transform", clients: "Outlook, Gmail" },
  { re: /\btransition\s*:/i, property: "transition", clients: "most clients" },
];

/** Flag inline CSS that common email clients drop, with 1-based line numbers. */
export function lintEmailHtml(html: string): CompatWarning[] {
  const out: CompatWarning[] = [];
  html.split("\n").forEach((line, i) => {
    for (const r of RULES) {
      if (r.re.test(line)) out.push({ line: i + 1, property: r.property, clients: r.clients });
    }
  });
  return out;
}
