import Link from "next/link";
import { ROUTES } from "@/lib/marketing/content";
import { PhotoFrame } from "@/components/marketing/xpl-ui";

export function HomeWho() {
  return (
    <section className="flex flex-col gap-5 px-5 py-14 lg:gap-10 lg:px-20 lg:pt-24 lg:pb-32">
      <div className="flex items-baseline gap-3 lg:gap-6">
        <span className="xpl-mono text-[11px] lg:text-xs">02 /</span>
        <h2 className="xpl-disp text-[28px] leading-none lg:text-[40px]">Who&apos;s exploring?</h2>
      </div>
      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-3 lg:gap-6">
        {ROUTES.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={`xpl-card min-h-[132px] flex-row lg:min-h-[520px] lg:flex-col ${
              route.tone === "blush"
                ? "bg-[var(--blush)]"
                : route.tone === "blueprint"
                  ? "border-[var(--blueprint)] bg-[var(--blueprint)] text-white"
                  : "bg-white"
            }`}
          >
            <PhotoFrame
              label={route.photo}
              ariaLabel={route.aria}
              grid={route.tone === "paper" ? "spark" : route.tone === "blueprint" ? "dark" : "ink"}
              className={`hidden lg:flex lg:flex-1 lg:border-b ${
                route.tone === "blueprint"
                  ? "border-white/20 text-white/85"
                  : route.tone === "paper"
                    ? "text-[var(--blueprint)]"
                    : "border-black/15"
              }`}
            />
            <div
              className={`flex w-[120px] shrink-0 items-center justify-center border-r p-2 text-center lg:hidden ${
                route.tone === "paper"
                  ? "xpl-grid-spark border-[var(--rule)] text-[var(--blueprint)]"
                  : route.tone === "blueprint"
                    ? "xpl-grid-dark border-white/20"
                    : "xpl-grid border-black/15"
              }`}
            >
              <span className="font-[family-name:var(--font-mono)] text-[9px] leading-[1.7] tracking-[0.12em] uppercase whitespace-pre-line">
                {route.photoMobile}
              </span>
            </div>
            <div className="flex flex-col justify-center gap-1.5 p-5 lg:gap-3 lg:p-7">
              <h3
                className={`xpl-disp text-2xl leading-none tracking-[-0.02em] lg:text-[32px] ${
                  route.tone === "blueprint" ? "text-white" : ""
                }`}
              >
                {route.title}
              </h3>
              <p className={`m-0 text-[15px] leading-[1.45] lg:text-[17px] lg:leading-[1.5] ${route.tone === "blueprint" ? "text-white" : ""}`}>
                {route.body}
              </p>
              <span
                className={`xpl-mono mt-0 flex gap-2 text-[11px] lg:mt-2 lg:text-xs ${
                  route.tone === "blueprint" ? "text-[var(--blush)]" : "text-[var(--blueprint)]"
                }`}
              >
                {route.cta} <span className="arr">→</span>
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
