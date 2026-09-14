import { PhotoFrame, TapeLabel, XplButton } from "@/components/marketing/xpl-ui";

export function HomeTeams() {
  return (
    <section className="grid items-center gap-6 bg-[var(--blush)] px-5 py-14 text-[var(--ink)] lg:grid-cols-[5fr_7fr] lg:gap-12 lg:px-20 lg:py-[112px]">
      <div className="flex flex-col gap-6 lg:order-2 lg:relative">
        <span className="xpl-mono text-[11px] leading-[1.7] text-[var(--blueprint)] lg:hidden">
          08 / School programmes run under Science Wing
        </span>
        <div className="relative">
          <PhotoFrame
            label={"[ Photo — a team of twelve building\none structure, evening · 3:2\n· no children in frame ]"}
            ariaLabel="Placeholder: adults building a large structure together in the evening, no children"
            className="aspect-[3/2] border border-[var(--rule)] bg-white"
          />
          <TapeLabel className="top-[-12px] right-6 hidden rotate-[1.5deg] bg-white text-[var(--ink)] ring-1 ring-[var(--blueprint)] lg:block">
            Team of 12 · 2 hrs
          </TapeLabel>
        </div>
      </div>
      <div className="flex flex-col gap-6 lg:order-1 lg:gap-8">
        <span className="xpl-mono hidden text-xs text-[var(--blueprint)] lg:block">
          08 / School programmes run under Science Wing
        </span>
        <h2 className="xpl-disp text-[40px] leading-[0.95] text-[var(--blueprint)] lg:text-[64px]">
          Something for teams too.
        </h2>
        <p className="m-0 font-[family-name:var(--font-mono)] text-[11px] leading-[1.9] tracking-[0.12em] uppercase lg:text-xs lg:leading-[2] lg:tracking-[0.14em]">
          Schools · Corporate workshops · Custom experiences
        </p>
        <XplButton href="/schools" className="h-[52px] self-stretch lg:h-auto lg:self-start">
          Work with us
        </XplButton>
      </div>
    </section>
  );
}
