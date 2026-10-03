import { AuthNav } from "./auth-nav";

// Auth is where customers arrive from the public site, so it keeps the public
// Poppins face (.customer-app) rather than the dashboard's Geist: Poppins is
// preloaded on every page, so the form renders in its real font on first paint
// instead of swapping in a late-loading Geist.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="customer-app">
      {/* Phones: the panel fills the screen under the nav (welcome actions sit in
          thumb reach at the bottom). sm+: a centered card. */}
      <main className="bg-muted relative flex min-h-svh flex-col items-center justify-center px-6 pt-20 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
        <AuthNav />
        <div className="flex w-full max-w-sm flex-1 flex-col justify-center sm:flex-none md:max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
