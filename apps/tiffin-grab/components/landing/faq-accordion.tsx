import { ChevronDown, MessageCircleQuestion, type LucideIcon } from "lucide-react";

export type FaqItem = { q: string; a: string; icon?: LucideIcon };

/** Questions as one panel of rows: icon, question, chevron; tap opens the answer in place. Native
 *  details with a shared name, so opening one closes the open one with no script. Answers slide open
 *  where the browser can animate details (interpolate-size); elsewhere they just open. */
export function FaqAccordion({ items, name, openFirst = true }: { items: FaqItem[]; name: string; openFirst?: boolean }) {
  return (
    <div className="grid rounded-[var(--lp-radius-lg,28px)] bg-card p-1.5 shadow-[inset_0_0_0_1px_var(--border),0_24px_50px_-36px_rgb(36_31_27/0.45)]">
      {items.map((f, i) => {
        const Icon = f.icon ?? MessageCircleQuestion;
        return (
          <details
            key={f.q}
            name={name}
            open={openFirst && i === 0}
            className="group rounded-[22px] border-border transition-colors duration-240 not-first:border-t open:border-t-transparent open:bg-muted [[open]+&]:border-t-transparent details-content:opacity-0 details-content:transition-[opacity,content-visibility] details-content:transition-discrete details-content:duration-360 details-content:ease-soft open:details-content:opacity-100 motion-reduce:details-content:transition-none"
          >
            <summary className="grid cursor-pointer list-none grid-cols-[40px_minmax(0,1fr)_20px] items-center gap-3.5 rounded-[22px] px-4 py-3.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#F06B1A] group-not-open:hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
              <span aria-hidden className="grid size-10 place-items-center rounded-full bg-[#F06B1A]/14 text-[#B4470F] [&_svg]:size-5"><Icon /></span>
              <span className="text-[16px] font-bold tracking-[-0.01em] sm:text-body">{f.q}</span>
              <ChevronDown aria-hidden className="size-5 text-muted-foreground transition-[rotate] duration-300 ease-soft group-open:rotate-180 motion-reduce:transition-none" />
            </summary>
            <p className="m-0 whitespace-pre-line px-4 pb-[18px] text-subhead leading-[1.55] text-pretty text-muted-foreground sm:pl-[70px]">{f.a}</p>
          </details>
        );
      })}
    </div>
  );
}
