import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { orders } from "@/db/schema";
import { Card } from "@realm/ui/card";
import { Separator } from "@realm/ui/separator";

// Looks up an order by deploymentId — render per request, never prerender.
export const dynamic = "force-dynamic";

export default async function ActivatePage({ params }: { params: Promise<{ deploymentId: string }> }) {
  const { deploymentId } = await params;
  const [sub] = await db.select().from(orders).where(eq(orders.deploymentId, deploymentId)).limit(1);
  if (!sub) notFound();

  const waitlisted = sub.status === "waitlisted";

  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <p className="text-sm uppercase tracking-wide text-muted-foreground">Service deployment</p>
      <h1 className="mt-2 text-3xl font-semibold">{sub.deploymentId}</h1>
      <p className="mt-3 text-muted-foreground">
        {waitlisted
          ? "You're on the waitlist for your area — we'll email you when delivery opens."
          : "Your subscription is active. Welcome to Tiffin Grab!"}
      </p>

      <Card className="mt-8 p-5 text-left text-sm">
        <div className="font-medium">Your account is ready</div>
        <p className="mt-1 text-muted-foreground">
          Log in with <span className="font-medium">{sub.fullName}</span>&apos;s checkout email (or phone) and the
          temporary password <code className="rounded bg-muted px-1">Tiffin123</code> — you&apos;ll set your own
          password on first sign-in, then you can manage your delivery schedule.
        </p>
        <Separator className="my-4" />
        <div className="font-medium">Pick your meals</div>
        <p className="mt-1 text-muted-foreground">
          Log in and open <span className="font-medium">My Meals</span> to choose your dishes for the
          coming week before the cutoff.
        </p>
        <a className="mt-2 inline-block text-primary underline" href="/dashboard/meals">
          Go to My Meals →
        </a>
      </Card>
    </main>
  );
}
