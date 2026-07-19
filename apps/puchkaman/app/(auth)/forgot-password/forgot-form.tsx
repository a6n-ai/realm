"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ForgotPasswordForm } from "@realm/auth-ui";
import { authClient } from "@/lib/auth/client";

export function ForgotForm() {
  const router = useRouter();

  return (
    <div className="hero-bg" style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ width: "100%", maxWidth: 400, padding: "clamp(28px,4vw,40px)" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <span
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              background: "var(--red)",
              border: "3px solid var(--ink)",
              display: "grid",
              placeItems: "center",
              boxShadow: "3px 3px 0 var(--ink)",
              flexShrink: 0,
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--yellow)", border: "2px solid var(--ink)" }} />
          </span>
          <span className="display" style={{ fontSize: "1.4rem", letterSpacing: "-0.04em" }}>
            PUCHKAMAN
          </span>
        </div>

        <p className="kicker" style={{ opacity: 0.6, marginBottom: 4 }}>
          Admin
        </p>

        <ForgotPasswordForm
          onSendEmailOtp={(email) => authClient.emailOtp.requestPasswordReset({ email })}
          onResetWithEmailOtp={({ email, otp, password }) =>
            authClient.emailOtp.resetPassword({ email, otp, password })
          }
          onSuccess={() => router.push("/login")}
        />

        <p style={{ textAlign: "center", marginTop: 22, fontSize: "0.85rem" }}>
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
