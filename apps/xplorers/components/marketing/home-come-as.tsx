import { PHOTOS } from "@/lib/marketing/photos";
import { PhotoFrame, XplButton } from "@/components/marketing/xpl-ui";

export function HomeComeAs() {
  return (
    <section className="grid items-start gap-6 px-5 py-14 lg:grid-cols-[5fr_7fr] lg:gap-12 lg:px-20 lg:py-32">
      <div className="flex flex-col gap-6 lg:gap-8">
        <span className="xpl-mono text-[11px] lg:text-xs">06 /</span>
        <h2 className="xpl-disp text-[40px] leading-[0.95] lg:text-[64px]">
          Come as
          <br className="hidden lg:block" />{" "}
          <span className="lg:text-[var(--blueprint)]">you are.</span>
        </h2>
        <p className="m-0 max-w-[400px] text-[17px] leading-[1.5] lg:text-xl lg:leading-[1.55]">
          Different ages. Different interests. One place to explore.
        </p>
        <div className="grid grid-cols-2 grid-rows-[120px_120px] gap-2.5 lg:hidden">
          <PhotoFrame
            label={"[ Grandparent\n+ child ]"}
            ariaLabel="Kids and adults together at an outdoor science bench"
            src={PHOTOS.kids}
            sizes="50vw"
            className="row-span-2 -rotate-[1.5deg] border border-[var(--rule)] bg-white"
          />
          <PhotoFrame
            label={"[ Wheelchair\nat worktable ]"}
            ariaLabel="Placeholder: wheelchair user at a worktable, drill in hand"
            className="rotate-[1deg] border border-[var(--rule)] bg-white p-2.5 text-[10px]"
          />
          <PhotoFrame
            label={"[ Two adults,\nconversation ]"}
            ariaLabel="A making session in progress"
            src={PHOTOS.making}
            sizes="50vw"
            className="-rotate-[0.8deg] border border-[var(--rule)] bg-[var(--blush)]"
          />
        </div>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.12em] uppercase lg:gap-3 lg:text-xs lg:tracking-[0.14em]">
          <li className="flex items-center gap-3">
            <span className="size-2 shrink-0 bg-[var(--blueprint)] lg:size-2" />
            Caretakers join free
          </li>
          <li className="flex items-center gap-3">
            <span className="size-2 shrink-0 bg-[var(--blueprint)]" />
            Wheelchair-accessible sessions
          </li>
          <li className="flex items-start gap-3">
            <span className="mt-1 size-2 shrink-0 bg-[var(--blueprint)] lg:mt-0 lg:self-center" />
            Move, snack or take a break whenever you need
          </li>
        </ul>
        <XplButton href="/the-place" variant="text" className="self-start">
          How we make this work
        </XplButton>
      </div>
      <div className="relative hidden auto-rows-[110px] grid-cols-6 gap-3 lg:grid">
        <PhotoFrame
          label={"[ Photo — grandparent and\nchild, one bench · 4:5 ]"}
          ariaLabel="Kids and adults together at an outdoor science bench"
          src={PHOTOS.kids}
          sizes="(min-width: 1024px) 30vw, 100vw"
          className="col-span-3 row-span-3 -rotate-[1.5deg] border border-[var(--rule)] bg-white shadow-[2px_2px_0_rgba(18,26,36,.08)]"
        />
        <PhotoFrame
          label={"[ Photo — wheelchair user at\nworktable, drill · 3:2 ]"}
          ariaLabel="Placeholder: wheelchair user at a worktable, drill in hand"
          className="col-span-3 row-span-2 mt-5 rotate-[1deg] border border-[var(--rule)] bg-white shadow-[2px_2px_0_rgba(18,26,36,.08)]"
        />
        <PhotoFrame
          label={"[ Photo — two adults,\nconversation · 1:1 ]"}
          ariaLabel="A making session in progress"
          src={PHOTOS.making}
          sizes="20vw"
          className="col-span-2 row-span-2 -rotate-[0.8deg] border border-[var(--rule)] bg-white shadow-[2px_2px_0_rgba(18,26,36,.08)]"
        />
        <PhotoFrame
          label={"[ Photo — the quiet corner · 3:2 ]"}
          ariaLabel="Seedlings growing in a tray by the window"
          src={PHOTOS.seedlings}
          sizes="30vw"
          className="col-span-3 row-span-2 -mt-2 rotate-[1.2deg] border border-[var(--rule)] bg-white shadow-[2px_2px_0_rgba(18,26,36,.08)]"
        />
        <PhotoFrame
          label={"[ Hands\n+ tools ]"}
          ariaLabel="Test tubes on a studio bench"
          src={PHOTOS.tubes}
          sizes="12vw"
          className="col-span-1 row-span-2 rotate-[2deg] border border-[var(--rule)] bg-[var(--blush)] shadow-[2px_2px_0_rgba(18,26,36,.08)]"
        />
        <p className="xpl-hand absolute -bottom-[34px] left-6 -rotate-2">nobody is posing in these</p>
      </div>
    </section>
  );
}
