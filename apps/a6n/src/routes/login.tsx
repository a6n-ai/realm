import { authErrorMessage, EmailCodeSignIn } from "@foundry/auth-ui";
import { createFileRoute, Link, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AUTH_QUIET_LINK, AuthCard, appAuthUi } from "../components/auth/auth-kit";
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
    <form method="post" onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Field label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" pending={pending}>
        Continue with password
      </Button>
      <Link to="/forgot-password" className={AUTH_QUIET_LINK}>
        Forgot password?
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
    <AuthCard
      title={search.invited ? "Welcome to a6n" : "Log in to a6n"}
      text={search.invited ? "Enter your email and we'll send you a sign-in code." : undefined}
      footer="Access is by invite. Ask your a6n admin."
    >
      <div className="flex flex-col gap-3">
        {tab === "password" ? (
          <PasswordForm onDone={done} defaultEmail={email} />
        ) : (
          <EmailCodeSignIn
            compact
            ui={appAuthUi}
            defaultEmail={email}
            onSendCode={(to) => authClient.emailOtp.sendVerificationOtp({ email: to, type: "sign-in" })}
            onVerify={(to, otp) => authClient.signIn.emailOtp({ email: to, otp })}
            onSuccess={done}
          />
        )}
        <button type="button" className={AUTH_QUIET_LINK} onClick={() => setTab(tab === "password" ? "code" : "password")}>
          {tab === "password" ? "Use an email code instead" : "Sign in with password"}
        </button>
      </div>
    </AuthCard>
  );
}
