import Link from "next/link";
import { BOARD } from "@/lib/marketing/content";
import { TapeLabel, XplButton } from "@/components/marketing/xpl-ui";

const TONE: Record<(typeof BOARD)[number]["tone"], string> = {
  muted: "text-[var(--graphite)]",
  action: "text-[var(--blueprint)]",
  ink: "text-[var(--ink)]",
};

export function HomeBoard() {
  return (
    <section className="xpl-grid flex flex-col gap-5 border-t border-[var(--rule)] bg-[var(--blush)] px-5 py-14 lg:grid lg:grid-cols-[4fr_8fr] lg:items-start lg:gap-16 lg:px-20 lg:pt-24 lg:pb-32">
      <div className="flex flex-col gap-5 lg:sticky lg:top-24 lg:gap-7">
        <span className="xpl-mono text-[11px] lg:text-xs">03 / This week at the studio</span>
        <h2 className="xpl-disp text-4xl leading-[0.95] lg:text-[64px]">Happening now.</h2>
        <p className="m-0 hidden max-w-[360px] text-xl leading-[1.55] text-pretty lg:block">
          Ages 5 to 75 on one board. Pick a bench.
        </p>
        <XplButton href="/whats-on" className="hidden self-start lg:inline-flex">
          Full calendar
        </XplButton>
      </div>
      <div className="xpl-board-paper relative mt-3 px-4 pt-6 pb-4 shadow-[3px_4px_0_rgba(18,26,36,.12)] lg:mt-0 lg:rotate-[0.4deg] lg:px-9 lg:py-8 lg:shadow-[4px_6px_0_rgba(18,26,36,.12)]">
        <TapeLabel className="top-[-12px] left-4 -rotate-2 lg:top-[-14px] lg:left-9">Today · Wed 16 Sep</TapeLabel>
        <div className="hidden items-baseline justify-between border-b-[1.5px] border-[var(--blueprint)] py-3 pt-3 pb-5 lg:flex">
          <span className="xpl-disp text-[32px]">What&apos;s on the benches</span>
          <span className="xpl-mono text-[11px]">Spots update live</span>
        </div>
        {BOARD.map((row) => (
          <Link
            key={row.time}
            href="/whats-on"
            className="flex flex-col gap-1.5 border-b border-[var(--rule)] py-3.5 lg:grid lg:grid-cols-[110px_1fr_auto_auto] lg:items-center lg:gap-6 lg:py-[18px]"
          >
            <div className="flex justify-between font-[family-name:var(--font-mono)] text-[10px] tracking-[0.12em] uppercase lg:contents">
              <span className="lg:text-[13px] lg:tracking-[0.1em]">{row.time}</span>
              <span className={`lg:hidden ${TONE[row.tone]}`}>{row.spots}</span>
            </div>
            <span className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2 lg:block">
                <span className="xpl-disp text-[22px] leading-none tracking-[-0.02em] lg:text-2xl">{row.title}</span>
                <span className="text-xl text-[var(--blueprint)] lg:hidden">→</span>
              </span>
              <span className="xpl-mono text-[10px] tracking-[0.08em] lg:text-[11px] lg:tracking-[0.1em]">{row.spec}</span>
            </span>
            <span className={`xpl-mono hidden whitespace-nowrap text-[11px] lg:block ${TONE[row.tone]}`}>{row.spots}</span>
            <span className="hidden text-[22px] text-[var(--blueprint)] lg:block">→</span>
          </Link>
        ))}
        <div className="flex items-center justify-between pt-3.5 lg:pt-5">
          <span className="xpl-mono text-[10px] tracking-[0.12em] lg:text-[11px]">Tomorrow · Thu 17 Sep →</span>
          <span className="xpl-hand hidden -rotate-2 text-2xl lg:inline">the 7pm one is adults only</span>
        </div>
      </div>
      <XplButton href="/whats-on" className="h-[52px] lg:hidden">
        Full calendar
      </XplButton>
    </section>
  );
}
