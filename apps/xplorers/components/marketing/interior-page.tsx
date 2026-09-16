import { XplButton } from "@/components/marketing/xpl-ui";

export function InteriorPage({
  kicker,
  title,
  body,
  cta,
  href = "/contact",
}: {
  kicker: string;
  title: string;
  body: string;
  cta: string;
  href?: string;
}) {
  return (
    <article>
      <header className="xpl-blush-band border-b border-[var(--rule)] px-5 py-14 lg:px-20 lg:py-24">
        <p className="xpl-mono text-[11px] lg:text-xs">{kicker}</p>
        <h1 className="xpl-disp mt-5 max-w-[16ch] text-[52px] leading-[0.9] tracking-[-0.04em] lg:text-[112px]">
          {title}
        </h1>
      </header>
      <section className="flex flex-col gap-8 px-5 py-14 lg:max-w-[720px] lg:px-20 lg:py-24">
        <p className="m-0 text-[17px] leading-[1.5] text-pretty lg:text-xl lg:leading-[1.55]">{body}</p>
        <XplButton href={href} className="h-[52px] self-start lg:h-auto">
          {cta}
        </XplButton>
      </section>
    </article>
  );
}
