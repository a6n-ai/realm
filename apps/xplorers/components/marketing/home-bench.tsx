import { BENCHES } from "@/lib/marketing/content";
import { PhotoFrame, TapeLabel, XplButton } from "@/components/marketing/xpl-ui";

export function HomeBench() {
  return (
    <section className="flex flex-col gap-6 bg-[var(--blueprint)] px-5 py-14 text-white lg:grid lg:grid-cols-[8fr_4fr] lg:items-end lg:gap-12 lg:px-20 lg:py-24">
      <span className="xpl-mono text-[11px] text-[var(--blush)] lg:hidden">05 / Live from the studio</span>
      <div className="relative">
        <PhotoFrame
          label={"[ Bench cam — live overhead frame\nCrafting Club in progress · adult hands,\nsawdust, a drink, a half-cut box joint · 16:10 ]"}
          ariaLabel="Placeholder: live overhead bench camera frame, Crafting Club in progress, adults' hands, sawdust, a drink"
          grid="dark"
          className="hidden aspect-[16/10] border border-white/30 text-white/80 lg:flex"
        />
        <PhotoFrame
          label={"[ Bench cam — live frame\nCrafting Club · adult hands,\nsawdust, a drink · 4:5 ]"}
          ariaLabel="Placeholder: live overhead bench camera frame, Crafting Club in progress"
          grid="dark"
          className="aspect-[4/5] border border-white/30 text-[10px] tracking-[0.12em] text-white/80 lg:hidden"
        />
        <div className="absolute top-3 left-3 flex items-center gap-2.5 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] uppercase lg:top-4 lg:left-4 lg:gap-4 lg:text-[11px] lg:tracking-[0.14em]">
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[var(--blush)]" />
            <span className="lg:hidden">Bench 02 · Wed 19:42</span>
            <span className="hidden lg:inline">Bench 02</span>
          </span>
          <span className="hidden lg:inline">Wed 19:42 SGT</span>
          <span className="hidden lg:inline">Crafting Club</span>
        </div>
        <TapeLabel className="top-3 right-3 rotate-[1.5deg] lg:top-4 lg:right-4">
          <span className="lg:hidden">2 spots tonight</span>
          <span className="hidden lg:inline">2 spots left tonight</span>
        </TapeLabel>
        <div className="xpl-hand absolute bottom-12 left-4 -rotate-3 text-[22px] text-white lg:top-[38%] lg:bottom-auto lg:left-[26%] lg:flex lg:flex-col lg:items-start lg:text-[26px]">
          third attempt at this joint
          <svg width="60" height="44" viewBox="0 0 60 44" aria-hidden="true" className="ml-6 hidden lg:block">
            <path d="M4 3 C 14 10, 30 22, 52 40" stroke="#FFFFFF" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M40 38 L53 41 L50 28" stroke="#FFFFFF" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="xpl-hand absolute right-[14%] bottom-[24%] hidden flex-col items-end text-[26px] text-white lg:flex">
          that&apos;s Mei&apos;s tea, not glue
          <svg width="50" height="40" viewBox="0 0 50 40" aria-hidden="true" className="mr-[30px]">
            <path d="M46 3 C 36 10, 22 20, 6 36" stroke="#FFFFFF" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <path d="M6 24 L5 37 L18 35" stroke="#FFFFFF" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="absolute bottom-4 left-4 hidden w-[280px] items-center gap-2.5 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] uppercase lg:flex">
          <div className="h-2.5 w-px bg-white" />
          <div className="h-px flex-1 bg-white" />
          <span>1200 mm bench</span>
          <div className="h-px flex-1 bg-white" />
          <div className="h-2.5 w-px bg-white" />
        </div>
      </div>
      <div className="flex flex-col gap-6 lg:gap-7">
        <span className="xpl-mono hidden text-xs text-[var(--blush)] lg:block">05 / Live from the studio</span>
        <h2 className="xpl-disp text-[38px] leading-[0.92] tracking-[-0.035em] text-white lg:text-[56px]">
          Right now, someone in this room is <span className="text-[var(--blush)]">making something.</span>
        </h2>
        <p className="m-0 text-[17px] leading-[1.5] lg:text-xl">Tomorrow it could be you.</p>
        <XplButton href="/whats-on" variant="inverse" className="h-[52px] self-stretch lg:h-auto lg:self-start">
          See what&apos;s on tonight
        </XplButton>
        <ul className="hidden list-none flex-col border-t border-white/20 p-0 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.12em] uppercase lg:flex">
          {BENCHES.map((b) => (
            <li key={b.id} className="flex justify-between border-b border-white/20 py-2.5">
              <span className="opacity-70">{b.id}</span>
              <span>{b.work}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
