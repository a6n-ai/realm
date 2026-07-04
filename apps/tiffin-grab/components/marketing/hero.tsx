import Link from "next/link";
import { Button } from "@realm/ui/button";
import { Section } from "./section";

export function Hero() {
  return (
    <Section className="flex flex-col items-center gap-6 py-24 text-center">
      <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Home-style tiffins, built exactly how you eat.
      </h1>
      <p className="text-muted-foreground max-w-xl text-lg">
        Pick your nutrition baseline, meal size, schedule, and duration. Fresh, customizable
        meals delivered across the Greater Toronto Area.
      </p>
      <div className="flex gap-3">
        <Button asChild size="lg"><Link href="/subscribe">Start your plan</Link></Button>
        <Button asChild size="lg" variant="outline"><Link href="/how-it-works">See how it works</Link></Button>
      </div>
    </Section>
  );
}
