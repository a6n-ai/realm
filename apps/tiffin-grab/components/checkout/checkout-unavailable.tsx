import Link from "next/link";

export function CheckoutUnavailable() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-20 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Sorry, checkout is unavailable</h1>
      <p className="text-muted-foreground text-pretty">Payments aren&apos;t set up yet. Please contact admin.</p>
      <Link href="/me" className="mt-2 text-sm font-semibold underline underline-offset-4">Back to your account</Link>
    </main>
  );
}
