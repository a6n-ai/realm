import type { ReactNode } from "react";
import { Button, Eyebrow, stagger } from "@/components/marketing/ui";

export function InteriorPage({
  kicker,
  title,
  body,
  cta,
  href = "/contact",
  children,
}: {
  kicker: string;
  title: string;
  body: string;
  cta: string;
  href?: string;
  children?: ReactNode;
}) {
  return (
    <article>
      <header className="xl-page-hero">
        <div className="xl-wrap">
          <Eyebrow dot style={stagger(0)}>
            {kicker}
          </Eyebrow>
          <h1 className="xl-display" style={stagger(1)}>
            {title}
          </h1>
          <p className="xl-lede" style={stagger(2)}>
            {body}
          </p>
          <div className="xl-row" style={stagger(3)}>
            <Button href={href} icon="arrow-right">
              {cta}
            </Button>
          </div>
        </div>
      </header>
      {children}
    </article>
  );
}
