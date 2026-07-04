"use client";

import { useRef, type CSSProperties, type ReactElement } from "react";
import { useTextLayout } from "./use-text-layout";

export interface TextProps {
  children: string;
  lines?: number;
  fit?: { maxWidth: number; maxHeight: number };
  as?: "span" | "p" | "div" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  className?: string;
  style?: CSSProperties;
  skeletonClassName?: string;
}

export function Text({
  children,
  lines,
  fit,
  as: Tag = "span",
  className,
  style,
  skeletonClassName,
}: TextProps): ReactElement {
  const ref = useRef<HTMLElement>(null);

  if (process.env.NODE_ENV !== "production" && lines != null && fit != null) {
    console.warn("Text: pass either `lines` or `fit`, not both");
  }

  const measured = lines != null || fit != null;
  const { ready, renderedLines, fontSizePx } = useTextLayout(ref, { text: children, lines, fit });

  if (!measured) {
    return (
      <Tag ref={ref as never} className={className} style={style}>
        {children}
      </Tag>
    );
  }

  if (!ready) {
    const skeletonClass = [className, skeletonClassName].filter(Boolean).join(" ");
    return <Tag ref={ref as never} className={skeletonClass || undefined} style={style} />;
  }

  if (renderedLines) {
    return (
      <Tag ref={ref as never} className={className} style={style}>
        {renderedLines.map((line, i) => (
          <span key={i} style={{ display: "block" }}>
            {line}
          </span>
        ))}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref as never}
      className={className}
      style={{ ...style, fontSize: fontSizePx != null ? `${fontSizePx}px` : style?.fontSize }}
    >
      {children}
    </Tag>
  );
}
