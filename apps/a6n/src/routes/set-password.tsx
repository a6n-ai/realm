import { AuthPanel, AuthScreen } from "@foundry/auth-ui";
import { passwordSchema } from "@foundry/commons";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { AuthLogo, AuthPage, appAuthUi } from "../components/auth/auth-kit";
import { errorText } from "../lib/error-copy";
import { getShell, setPasswordFn } from "../lib/auth/shell.fns";

export const Route = createFileRoute("/set-password")({
  beforeLoad: async () => {
    const shell = await getShell();
    if (!shell) throw redirect({ to: "/login" });
    if (shell.user.passwordSet) throw redirect({ to: "/inquiries" });
  },
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const Button = appAuthUi.Button!;
  const Field = appAuthUi.Field!;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Choose a stronger password.");
    if (password !== confirm) return setError("Passwords do not match.");
    setError(null);
    setPending(true);
    try {
      const res = await setPasswordFn({ data: { password } });
      if (!res.ok) return setError(errorText(new Error(res.code)));
      await router.invalidate();
      await router.navigate({ to: "/inquiries" });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthPage>
      <AuthScreen>
        <AuthPanel art={<AuthLogo />} title="Set your password" tagline="Choose a password to finish setting up your account.">
          <form method="post" onSubmit={submit} className="grid gap-5">
            <Field label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Field label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" pending={pending}>
              Save password
            </Button>
          </form>
        </AuthPanel>
      </AuthScreen>
    </AuthPage>
  );
}
