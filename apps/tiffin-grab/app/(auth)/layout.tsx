import { AuthNav } from "./auth-nav";

// Same pattern as puchkaman: auth is the gateway into the CRM/customer
// shells (both Geist), not a marketing page, so it opts out of the public
// Poppins font too via .crm-app.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm-app">
      <main className="bg-muted relative flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
        <AuthNav />
        <div className="w-full max-w-sm md:max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
