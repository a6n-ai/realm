const STEPS = [
  { n: 1, title: "Nutrition baseline", body: "Choose Pure Vegetarian, Halal Non-Veg, or a Veg & Non-Veg mix." },
  { n: 2, title: "Build your bundle", body: "Pick a meal size and tier; see calories, protein, carbs, and fat." },
  { n: 3, title: "Schedule & quantity", body: "Set frequency, daily quantity, weekend add-ons, and number of persons. More delivery days and weeks means more tiffins — and a lower per-tiffin rate." },
  { n: 4, title: "Duration & checkout", body: "Choose a commitment length. Longer plans mean more tiffins total, which can push you into a better volume tier." },
];

export function HowItWorksSteps({ eyebrow = "How it works" }: { eyebrow?: string }) {
  return (
    <div className="space-y-8">
      <div className="max-w-2xl">
        <p className="m-0 mb-1 text-xs font-semibold tracking-[0.25em] text-primary uppercase">{eyebrow}</p>
        <h2 className="m-0 text-[clamp(28px,5vw,50px)] leading-[1.05] font-bold tracking-[-1.5px]">Baseline to first delivery.</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s) => (
          <div key={s.n} className="rounded-2xl border-[1.5px] border-foreground p-6">
            <span className="block text-[clamp(30px,4vw,40px)] font-extrabold tracking-tight text-transparent [-webkit-text-stroke:1.5px_var(--color-primary)] tabular-nums">
              {String(s.n).padStart(2, "0")}
            </span>
            <h3 className="mt-1 text-lg font-bold tracking-[-0.5px]">{s.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
