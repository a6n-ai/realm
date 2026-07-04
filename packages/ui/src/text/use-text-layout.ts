"use client";

import { useLayoutEffect, useState, type RefObject } from "react";
import { clampToLines, fitFontSize } from "./text-math";

export interface UseTextLayoutOptions {
  text: string;
  lines?: number;
  fit?: { maxWidth: number; maxHeight: number };
}

export interface TextLayoutResult {
  ready: boolean;
  renderedLines: string[] | null;
  fontSizePx: number | null;
}

const NOT_READY: TextLayoutResult = { ready: false, renderedLines: null, fontSizePx: null };

export function useTextLayout(
  ref: RefObject<HTMLElement | null>,
  { text, lines, fit }: UseTextLayoutOptions,
): TextLayoutResult {
  const [result, setResult] = useState<TextLayoutResult>(NOT_READY);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !text || (lines == null && fit == null)) return;

    const measure = () => {
      const computed = getComputedStyle(el);
      const font = computed.font;
      const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;

      if (lines != null) {
        // Clamp mode forces the element to display:block (see Text component), so its clientWidth
        // is the container's content width — the space the text actually wraps into.
        const width = el.clientWidth;
        if (width <= 0) return;
        const clamp = clampToLines(text, font, width, lineHeight, lines);
        setResult({ ready: true, renderedLines: clamp.lines, fontSizePx: null });
        return;
      }

      if (fit != null) {
        const fitted = fitFontSize(text, font, fit.maxWidth, fit.maxHeight, lineHeight);
        setResult({ ready: true, renderedLines: null, fontSizePx: fitted.fontSizePx });
      }
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, text, lines, fit?.maxWidth, fit?.maxHeight]);

  return result;
}
