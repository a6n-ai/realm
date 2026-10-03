import { AuthNav } from "./auth-nav";

// Same pattern as puchkaman: auth is the gateway into the CRM/customer
// shells (both Geist), not a marketing page, so it opts out of the public
// Poppins font too via .crm-app.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm-app">
      {/* Phones: the panel fills the screen under the nav (welcome actions sit in
          thumb reach at the bottom). sm+: a centered card. */}
      <main className="bg-muted relative flex min-h-svh flex-col items-center justify-center px-6 pt-20 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:p-10">
        <AuthNav />
        <div className="flex w-full max-w-sm flex-1 flex-col justify-center sm:flex-none md:max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
