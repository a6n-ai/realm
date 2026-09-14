import { PhotoFrame, XplButton } from "@/components/marketing/xpl-ui";

const DAYS = [
  {
    title: "Birthdays",
    spec: "From $48/child · min 15\nor $58/child · min 12",
    aria: "Placeholder: a birthday party in progress at the bench",
    photo: "[ Photo — birthday in\nprogress · 3:2 ]",
  },
  {
    title: "Private sessions",
    spec: "Your objective, your pace\nfrom $160",
    aria: "Placeholder: a private workshop, one family, one long project",
    photo: "[ Photo — private workshop\n· 3:2 ]",
  },
  {
    title: "Community events",
    spec: "Markets, family days,\nlibrary programmes",
    aria: "Placeholder: a community market stall run by Xplorers",
    photo: "[ Photo — community event,\noutdoors · 3:2 ]",
  },
];

export function HomeRemember() {
  return (
    <section className="flex flex-col gap-6 border-t border-[var(--rule)] px-5 py-14 lg:gap-10 lg:px-20 lg:pt-[112px] lg:pb-32">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-baseline lg:gap-6">
        <span className="xpl-mono text-[11px] lg:text-xs">07 /</span>
        <h2 className="xpl-disp text-[32px] leading-[0.95] lg:text-[40px] lg:leading-none">Make it a day to remember.</h2>
        <XplButton href="/contact" className="ml-auto hidden px-[22px] py-3.5 text-xs lg:inline-flex">
          Enquire
        </XplButton>
      </div>
      <div className="hidden grid-cols-3 gap-6 lg:grid">
        {DAYS.map((d) => (
          <div key={d.title} className="flex flex-col gap-4">
            <PhotoFrame label={d.photo} ariaLabel={d.aria} className="aspect-[3/2] border border-[var(--rule)] bg-white" />
            <h3 className="xpl-disp text-[26px] tracking-[-0.02em]">{d.title}</h3>
            <span className="xpl-mono text-[11px] leading-[1.8] tracking-[0.1em] whitespace-pre-line">{d.spec}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-4 lg:hidden">
        {DAYS.map((d, i) => (
          <div
            key={d.title}
            className={`flex items-center gap-3.5 ${i < DAYS.length - 1 ? "border-b border-[var(--rule)] pb-4" : ""}`}
          >
            <PhotoFrame label="" ariaLabel={d.aria} className="aspect-square w-24 shrink-0 border border-[var(--rule)] bg-white p-0" />
            <div className="flex flex-col gap-1">
              <h3 className="xpl-disp text-[22px] tracking-[-0.02em]">{d.title}</h3>
              <span className="xpl-mono text-[10px] leading-[1.7] tracking-[0.08em] whitespace-pre-line">{d.spec}</span>
            </div>
          </div>
        ))}
      </div>
      <XplButton href="/contact" className="h-[52px] lg:hidden">
        Enquire
      </XplButton>
    </section>
  );
}
