import { METHOD_CHAIN } from "@/lib/marketing/content";

export function HomeMethod() {
  return (
    <section className="flex flex-col gap-6 border-t border-[var(--rule)] px-5 py-14 lg:gap-14 lg:px-20 lg:pt-[112px] lg:pb-32">
      <div className="grid items-end gap-6 lg:grid-cols-[5fr_7fr] lg:gap-12">
        <div className="flex flex-col gap-6 lg:gap-6">
          <span className="xpl-mono text-[11px] lg:text-xs">04 / No curriculum</span>
          <h2 className="xpl-disp text-[40px] leading-[0.95] lg:text-[64px]">How things get made here.</h2>
        </div>
        <p className="m-0 max-w-[440px] text-[17px] leading-[1.5] text-pretty lg:justify-self-end lg:text-xl lg:leading-[1.55]">
          Nobody follows a worksheet. You get an idea, you try it, it breaks, you fix it. Then you show someone.
        </p>
      </div>
      <div className="xpl-grid xpl-board-paper relative mt-3 flex flex-col items-center gap-5 px-4 pt-10 pb-8 shadow-[3px_4px_0_rgba(18,26,36,.12)] lg:mt-0 lg:gap-0 lg:px-12 lg:pt-[72px] lg:pb-[88px] lg:shadow-[4px_6px_0_rgba(18,26,36,.12)]">
        <span className="xpl-tape top-[-12px] left-4 -rotate-2 lg:top-[-14px] lg:left-12">Fig. 1 · The whole method</span>
        <span className="xpl-mono absolute top-6 right-12 hidden text-[11px] lg:block">Repeat as needed</span>
        <div className="flex w-full flex-col items-center lg:flex-row lg:justify-center">
          {METHOD_CHAIN.map((step, i) => (
            <div key={step.word} className="flex flex-col items-center lg:flex-row lg:items-center">
              <div className="relative flex flex-col items-center">
                <div className="flex items-center gap-3.5">
                  <div
                    className={`xpl-disp whitespace-nowrap border-[1.5px] border-[var(--blueprint)] px-[18px] py-3 text-2xl tracking-[-0.02em] lg:px-5 lg:py-4 lg:text-[26px] ${
                      step.oops ? "xpl-oops bg-[var(--blush)] shadow-[3px_4px_0_rgba(18,26,36,.18)]" : "bg-white shadow-[2px_2px_0_rgba(18,26,36,.08)]"
                    }`}
                    style={{ transform: step.oops ? undefined : i % 2 ? "rotate(0.6deg)" : "rotate(-0.6deg)" }}
                  >
                    {step.word}
                  </div>
                  {"note" in step && step.note ? (
                    <span className="xpl-hand -rotate-2 text-xl whitespace-nowrap lg:hidden">{step.note}</span>
                  ) : null}
                </div>
                {"note" in step && step.note ? (
                  <div className="xpl-hand absolute top-full mt-3.5 hidden -rotate-2 whitespace-nowrap lg:block">{step.note}</div>
                ) : null}
              </div>
              {i < METHOD_CHAIN.length - 1 ? (
                <>
                  <svg width="16" height="36" viewBox="0 0 16 36" aria-hidden="true" className="lg:hidden">
                    <path d="M8 1 C 6 10, 10 22, 8 33" stroke="#1B3A6B" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    <path
                      d="M2 27 L8 34 L14 27"
                      stroke="#1B3A6B"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <svg width="44" height="16" viewBox="0 0 44 16" aria-hidden="true" className="hidden shrink-0 lg:block">
                    <path d="M1 8 C 12 6, 24 10, 41 8" stroke="#1B3A6B" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                    <path
                      d="M34 2 L42 8 L34 14"
                      stroke="#1B3A6B"
                      strokeWidth="1.5"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </>
              ) : null}
            </div>
          ))}
        </div>
        <span className="xpl-mono text-center text-[10px] leading-[1.7] lg:hidden">
          One session · about 90 min
          <br />
          Repeat as needed
        </span>
        <div className="absolute right-12 bottom-7 left-12 hidden items-center gap-2.5 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] uppercase lg:flex">
          <div className="h-2.5 w-px bg-[var(--blueprint)]" />
          <div className="h-px flex-1 bg-[var(--blueprint)]" />
          <span>One session · about 90 minutes · usually two loops</span>
          <div className="h-px flex-1 bg-[var(--blueprint)]" />
          <div className="h-2.5 w-px bg-[var(--blueprint)]" />
        </div>
      </div>
    </section>
  );
}
