import type { CSSProperties, ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import type { ProgrammeKey } from "@/lib/marketing/content";
import { PHOTOS } from "@/lib/marketing/photos";

/** Stagger index for the CSS load sequence (`--i`). */
export const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

type ButtonProps = {
  children: ReactNode;
  href?: string;
  variant?: "primary" | "secondary" | "success" | "ghost-inverse";
  size?: "md" | "sm" | "xs";
  icon?: "arrow-right" | "arrow-up-right";
  block?: boolean;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
};

export function Button({
  children,
  href,
  variant = "primary",
  size = "md",
  icon,
  block,
  type = "button",
  disabled,
  className,
  onClick,
}: ButtonProps) {
  const Glyph = icon === "arrow-right" ? ArrowRight : icon === "arrow-up-right" ? ArrowUpRight : null;
  const props = {
    className: className ? `xl-btn ${className}` : "xl-btn",
    "data-variant": variant === "primary" ? undefined : variant,
    "data-size": size === "md" ? undefined : size,
    "data-block": block ? "" : undefined,
  };
  const content = (
    <>
      {children}
      {Glyph ? <Glyph size={size === "md" ? 17 : 15} strokeWidth={2.2} aria-hidden /> : null}
    </>
  );
  if (href && !disabled) {
    return href.startsWith("/") ? (
      <Link href={href} {...props}>
        {content}
      </Link>
    ) : (
      <a href={href} {...props}>
        {content}
      </a>
    );
  }
  return (
    <button type={type} disabled={disabled} onClick={onClick} {...props}>
      {content}
    </button>
  );
}

export function Eyebrow({
  children,
  tone,
  dot,
  style,
}: {
  children: ReactNode;
  tone?: "ink" | "deep";
  dot?: boolean;
  style?: CSSProperties;
}) {
  return (
    <p className="xl-eyebrow" data-tone={tone} data-dot={dot ? "" : undefined} style={style}>
      {children}
    </p>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  size,
  align,
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: string;
  size?: "md";
  align?: "center";
  as?: "h1" | "h2";
}) {
  return (
    <div className="xl-heading" data-align={align}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <Tag className="xl-h2" data-size={size}>
        {title}
      </Tag>
      {lede ? <p className="xl-lede">{lede}</p> : null}
    </div>
  );
}

export function Pill({ children, variant }: { children: ReactNode; variant?: "sunshine" | "pink" }) {
  return (
    <span className="xl-pill" data-variant={variant}>
      {children}
    </span>
  );
}

export function Notice({ icon: Glyph, tone, children }: { icon?: LucideIcon; tone?: "sky"; children: ReactNode }) {
  return (
    <div className="xl-notice" data-tone={tone}>
      {Glyph ? <Glyph size={18} aria-hidden /> : null}
      <div>{children}</div>
    </div>
  );
}

export function PriceTable({ caption, columns, rows }: { caption?: string; columns: string[]; rows: string[][] }) {
  return (
    <div className="xl-price">
      <table>
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c} scope="col">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((v, i) => (
                <td key={i}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QuoteCard({ quote, who, programme }: { quote: string; who: string; programme?: ProgrammeKey }) {
  return (
    <figure className="xl-quote" data-programme={programme}>
      <blockquote>“{quote}”</blockquote>
      <figcaption>{who}</figcaption>
    </figure>
  );
}

export function TrustBar({ items }: { items: { icon: LucideIcon; label: string }[] }) {
  return (
    <div className="xl-trust">
      <ul className="xl-wrap">
        {items.map(({ icon: Glyph, label }) => (
          <li key={label}>
            <Glyph size={17} strokeWidth={2.3} aria-hidden />
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The hero illustration. Decorative: the headline beside it carries the message. */
export function HeroCollage() {
  return (
    <div className="xl-collage" aria-hidden>
      <div className="xl-collage-plate" />
      <div className="xl-collage-card">
        <Image src={PHOTOS.hero} alt="" fill priority sizes="(max-width: 960px) 100vw, 50vw" />
        <div className="xl-collage-sticker" style={stagger(0)}>
          a little wonder, every day
        </div>
      </div>
    </div>
  );
}
