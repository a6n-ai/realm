import { AuthNav } from "./auth-nav";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted relative flex min-h-svh flex-col items-center justify-center p-6 md:p-10">
      <AuthNav />
      <div className="w-full max-w-sm md:max-w-3xl">{children}</div>
    </main>
  );
}
