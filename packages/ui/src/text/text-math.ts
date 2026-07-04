import { layout, layoutWithLines, prepare, prepareWithSegments } from "@chenglou/pretext";

const ELLIPSIS = "…";
const FONT_SIZE_RE = /(\d+(?:\.\d+)?)px/;

export interface ClampResult {
  lines: string[];
  truncated: boolean;
}

export function clampToLines(
  text: string,
  font: string,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): ClampResult {
  if (maxLines < 1) throw new Error("maxLines must be >= 1");

  const full = layoutWithLines(prepareWithSegments(text, font), maxWidth, lineHeight);
  if (full.lines.length <= maxLines) {
    return { lines: full.lines.map((line) => line.text), truncated: false };
  }

  const kept = full.lines.slice(0, maxLines).map((line) => line.text);
  kept[maxLines - 1] = fitEllipsis(full.lines[maxLines - 1].text, font, maxWidth, lineHeight);
  return { lines: kept, truncated: true };
}

function fitEllipsis(lineText: string, font: string, maxWidth: number, lineHeight: number): string {
  let candidate = lineText.trimEnd();
  while (candidate.length > 0) {
    const withEllipsis = candidate + ELLIPSIS;
    const measured = layout(prepare(withEllipsis, font), maxWidth, lineHeight);
    if (measured.lineCount <= 1) return withEllipsis;
    candidate = candidate.slice(0, -1).trimEnd();
  }
  return ELLIPSIS;
}

export interface FitResult {
  font: string;
  fontSizePx: number;
}

export function fitFontSize(
  text: string,
  baseFont: string,
  maxWidth: number,
  maxHeight: number,
  lineHeight: number,
  minFontPx = 8,
): FitResult {
  const match = baseFont.match(FONT_SIZE_RE);
  if (!match) throw new Error(`font string has no px size: "${baseFont}"`);
  const baseFontPx = Number(match[1]);

  const fitsAt = (fontPx: number): boolean => {
    const font = baseFont.replace(FONT_SIZE_RE, `${fontPx}px`);
    const scaledLineHeight = lineHeight * (fontPx / baseFontPx);
    return layout(prepare(text, font), maxWidth, scaledLineHeight).height <= maxHeight;
  };

  if (fitsAt(baseFontPx)) return { font: baseFont, fontSizePx: baseFontPx };

  let lo = minFontPx;
  let hi = baseFontPx;
  if (!fitsAt(lo)) {
    return { font: baseFont.replace(FONT_SIZE_RE, `${lo}px`), fontSizePx: lo };
  }

  for (let i = 0; i < 8; i++) {
    const mid = Math.round((lo + hi) / 2);
    if (mid === lo || mid === hi) break;
    if (fitsAt(mid)) lo = mid;
    else hi = mid;
  }

  return { font: baseFont.replace(FONT_SIZE_RE, `${lo}px`), fontSizePx: lo };
}
