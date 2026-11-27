import { AUTH_LINK, AuthPanel, AuthScreen, authErrorMessage, EmailCodeSignIn } from "@foundry/auth-ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AuthLogo, AuthPage, appAuthUi } from "../components/auth/auth-kit";
import { authClient } from "../lib/auth/client";
import { safeRedirect } from "../lib/auth/redirect";
import { getShell } from "../lib/auth/shell.fns";

type LoginSearch = { email?: string; invited?: boolean; redirect?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): LoginSearch => ({
    email: typeof s.email === "string" && s.email ? s.email : undefined,
    invited: s.invited === true || s.invited === 1 || s.invited === "1" ? true : undefined,
    redirect: typeof s.redirect === "string" && s.redirect ? s.redirect : undefined,
  }),
  beforeLoad: async ({ search }) => {
    const shell = await getShell();
    if (!shell) return;
    throw redirect({ to: (shell.user.passwordSet ? safeRedirect(search.redirect) : "/set-password") as never });
  },
  component: LoginPage,
});

function PasswordForm({ onDone, defaultEmail }: { onDone: () => Promise<void>; defaultEmail: string }) {
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const Button = appAuthUi.Button!;
  const Field = appAuthUi.Field!;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await authClient.signIn.email({ email, password });
      if (res.error) return setError(authErrorMessage(res.error, "password"));
      await onDone();
    } finally {
      setPending(false);
    }
  }

  return (
    <form method="post" onSubmit={submit} className="grid gap-5">
      <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        Sign in
      </Button>
      <Link to="/forgot-password" className={`${AUTH_LINK} inline-flex items-center justify-center`}>
        Forgot your password?
      </Link>
    </form>
  );
}

function LoginPage() {
  const search = Route.useSearch();
  const router = useRouter();
  const [tab, setTab] = useState(search.invited ? "code" : "password");
  const email = search.email ?? "";

  const done = async () => {
    await router.invalidate();
    await router.navigate({ to: safeRedirect(search.redirect) as never });
  };

  return (
    <AuthPage>
      <AuthScreen>
        <AuthPanel
          art={<AuthLogo />}
          title={search.invited ? "Welcome to a6n CRM" : "Sign in"}
          tagline={search.invited ? "Enter your email and we'll send you a sign-in code." : "Use your password or a code sent to your email."}
        >
          <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
            <TabsList>
              <TabsTrigger value="password">Password</TabsTrigger>
              <TabsTrigger value="code">Email code</TabsTrigger>
            </TabsList>
            <TabsContent value="password" className="pt-4">
              <PasswordForm onDone={done} defaultEmail={email} />
            </TabsContent>
            <TabsContent value="code" className="pt-4">
              <EmailCodeSignIn
                compact
                ui={appAuthUi}
                defaultEmail={email}
                onSendCode={(to) => authClient.emailOtp.sendVerificationOtp({ email: to, type: "sign-in" })}
                onVerify={(to, otp) => authClient.signIn.emailOtp({ email: to, otp })}
                onSuccess={done}
              />
            </TabsContent>
          </Tabs>
        </AuthPanel>
      </AuthScreen>
    </AuthPage>
  );
}
