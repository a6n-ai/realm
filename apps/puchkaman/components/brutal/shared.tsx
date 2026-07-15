import Link from "next/link";
import { useId, type CSSProperties, type MouseEventHandler, type ReactNode } from "react";

/* Route map — the design's hash-router `page` names → real Next routes. */
export const ROUTE: Record<string, string> = {
  home: "/",
  menu: "/menu",
  fusion: "/fusion",
  catering: "/catering",
  events: "/events",
  order: "/order",
  about: "/about",
  contact: "/contact",
};

type Variant = "white" | "yellow" | "red" | "ink" | "cream";

const FILLS: Record<Variant, string> = {
  white: "btn--white",
  yellow: "btn--yellow",
  red: "btn--red",
  ink: "btn--ink",
  cream: "btn--cream",
};

/* ---------- Button ---------- */
export function Btn({
  children,
  variant = "white",
  size,
  block,
  page,
  href,
  onClick,
  className = "",
  style,
}: {
  children: ReactNode;
  variant?: Variant;
  size?: "lg" | "sm";
  block?: boolean;
  page?: keyof typeof ROUTE | string;
  href?: string;
  onClick?: MouseEventHandler;
  className?: string;
  style?: CSSProperties;
}) {
  const cls = [
    "btn",
    FILLS[variant] ?? "btn--white",
    size === "lg" ? "btn--lg" : size === "sm" ? "btn--sm" : "",
    block ? "btn--block" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const to = page ? (ROUTE[page] ?? `/${page}`) : href;
  // No destination → a real action button (onClick only, no navigation).
  if (!to) {
    return (
      <button type="button" className={cls} style={style} onClick={onClick}>
        {children}
      </button>
    );
  }
  // External / anchor links stay <a>; internal routes use <Link>.
  if (/^(https?:|#|mailto:|tel:)/.test(to)) {
    return (
      <a href={to} className={cls} style={style} onClick={onClick}>
        {children}
      </a>
    );
  }
  return (
    <Link href={to} className={cls} style={style} onClick={onClick}>
      {children}
    </Link>
  );
}

/* ---------- Placeholder image ---------- */
export function Ph({
  label,
  ratio = "4 / 3",
  mod = "",
  style = {},
  children,
  className = "",
}: {
  label: string;
  ratio?: string;
  mod?: string;
  style?: CSSProperties;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`ph ${mod} ${className}`} style={{ aspectRatio: ratio, ...style }}>
      {children}
      <span className="ph__label">▦ {label}</span>
    </div>
  );
}

/* ---------- Pill ---------- */
export function Pill({
  children,
  variant = "",
  className = "",
}: {
  children: ReactNode;
  variant?: "" | "red" | "yellow" | "ink" | "mint";
  className?: string;
}) {
  const v = variant ? `pill--${variant}` : "";
  return <span className={`pill ${v} ${className}`}>{children}</span>;
}

/* ---------- Star rating ---------- */
function Star({ fill, size }: { fill: number; size: number }) {
  const id = "sg" + useId().replace(/[:]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      <defs>
        <linearGradient id={id}>
          <stop offset={fill * 100 + "%"} stopColor="var(--ink)" />
          <stop offset={fill * 100 + "%"} stopColor="transparent" />
        </linearGradient>
      </defs>
      <path
        d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 5 20.4l1.4-6.8L1.3 9l6.9-.7z"
        fill={fill === 0 ? "transparent" : `url(#${id})`}
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Stars({ value = 5, size = 18 }: { value?: number; size?: number }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className="stars" aria-label={value + " stars"}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = i < full ? 1 : i === full && half ? 0.5 : 0;
        return <Star key={i} fill={fill} size={size} />;
      })}
    </span>
  );
}

/* ---------- Section heading ---------- */
export function SectionHead({
  kicker,
  title,
  sub,
  align = "left",
  light = false,
}: {
  kicker?: string;
  title: ReactNode;
  sub?: string;
  align?: "left" | "center";
  light?: boolean;
}) {
  return (
    <div
      className={`sec-head ${align === "center" ? "tac" : ""}`}
      style={{ marginBottom: 32, color: light ? "#fff" : "inherit" }}
    >
      {kicker && (
        <div
          style={{
            marginBottom: 12,
            display: "flex",
            justifyContent: align === "center" ? "center" : "flex-start",
          }}
        >
          <span
            className="tape kicker"
            style={{
              background: light ? "var(--red)" : "var(--yellow)",
              color: light ? "#fff" : "var(--ink)",
            }}
          >
            {kicker}
          </span>
        </div>
      )}
      <h2
        className="display"
        style={{
          fontSize: "clamp(2rem, 5.5vw, 3.4rem)",
          maxWidth: 760,
          marginInline: align === "center" ? "auto" : 0,
        }}
      >
        {title}
      </h2>
      {sub && (
        <p
          style={{
            marginTop: 14,
            fontSize: "1.05rem",
            maxWidth: 560,
            marginInline: align === "center" ? "auto" : 0,
            fontWeight: 500,
            opacity: 0.92,
          }}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/* ---------- Marquee ---------- */
export function Marquee({ items, variant = "" }: { items: string[]; variant?: string }) {
  const row = (
    <span>
      {items.map((it, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 34 }}>
          {it} <span style={{ color: "var(--red)" }}>✦</span>
        </span>
      ))}
    </span>
  );
  return (
    <div className={`marquee ${variant}`}>
      <div className="marquee__track">
        {row}
        {row}
      </div>
    </div>
  );
}

/* ---------- Page header band (inner pages) ---------- */
export function PageBanner({
  kicker,
  title,
  sub,
  bg = "var(--red)",
  color = "#fff",
  surface,
}: {
  kicker?: string;
  title: ReactNode;
  sub?: string;
  bg?: string;
  color?: string;
  surface?: string;
}) {
  const auto = bg.includes("--ink")
    ? "surface-ink"
    : bg.includes("--red")
      ? "surface-red"
      : bg.includes("--yellow")
        ? "surface-yellow"
        : bg.includes("--cream")
          ? "surface-cream"
          : "surface-white";
  return (
    <section className={surface || auto} style={{ background: bg, color, borderBottom: "var(--border)" }}>
      <div className="wrap" style={{ padding: "54px 20px 56px" }}>
        {kicker && (
          <div style={{ marginBottom: 14 }}>
            <span className="tape kicker" style={{ background: "var(--ink)", color: "var(--yellow)" }}>
              {kicker}
            </span>
          </div>
        )}
        <h1 className="display" style={{ fontSize: "clamp(2.4rem, 7vw, 4.6rem)" }}>
          {title}
        </h1>
        {sub && <p style={{ marginTop: 16, fontSize: "1.12rem", maxWidth: 620, fontWeight: 500 }}>{sub}</p>}
      </div>
    </section>
  );
}
