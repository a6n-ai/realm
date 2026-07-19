import { Suspense } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/auth/guards";
import { ChangePasswordForm } from "./change-password-form";
import { ChangeEmailForm } from "./change-email-form";

export default function AccountPage() {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <p className="kicker" style={{ opacity: 0.55, marginBottom: 4 }}>
          Settings
        </p>
        <h1 className="display" style={{ fontSize: "1.8rem" }}>
          Account
        </h1>
        <p style={{ opacity: 0.7, fontWeight: 500, marginTop: 4 }}>Your profile and password.</p>
      </div>
      <Suspense fallback={<AccountSkeleton />}>
        <AccountData />
      </Suspense>
    </div>
  );
}

async function AccountData() {
  await requireAdmin();
  const session = await getSession();
  if (!session?.user) return null;

  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.publicId, session.user.id)).limit(1);

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 480 }}>
      <section className="card" style={{ padding: "clamp(20px,3vw,28px)" }}>
        <p className="kicker" style={{ opacity: 0.55, marginBottom: 14 }}>
          Profile
        </p>
        <div style={{ display: "grid", gap: 14 }}>
          <div className="field">
            <label>Name</label>
            <p style={{ fontWeight: 600 }}>{u?.name?.trim() || "—"}</p>
          </div>
          <div className="field">
            <label>Email</label>
            <p style={{ fontWeight: 600 }}>{session.user.email}</p>
          </div>
          <div className="field">
            <label>Role</label>
            <p style={{ fontWeight: 600, textTransform: "capitalize" }}>{session.user.role}</p>
          </div>
        </div>
      </section>

      <section className="card" style={{ padding: "clamp(20px,3vw,28px)" }}>
        <p className="kicker" style={{ opacity: 0.55, marginBottom: 4 }}>
          Password
        </p>
        <p style={{ opacity: 0.7, fontWeight: 500, marginBottom: 18, fontSize: "0.92rem" }}>
          Change your password. This signs you out on other devices.
        </p>
        <ChangePasswordForm />
      </section>

      <section className="card" style={{ padding: "clamp(20px,3vw,28px)" }}>
        <p className="kicker" style={{ opacity: 0.55, marginBottom: 4 }}>
          Email
        </p>
        <p style={{ opacity: 0.7, fontWeight: 500, marginBottom: 18, fontSize: "0.92rem" }}>
          Change your email. We&apos;ll send a code to your current email ({session.user.email}) first, then a
          second code to the new address.
        </p>
        <ChangeEmailForm currentEmail={session.user.email} />
      </section>
    </div>
  );
}

function AccountSkeleton() {
  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 480 }}>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card" style={{ padding: "clamp(20px,3vw,28px)", display: "grid", gap: 14 }}>
          <div style={{ height: 14, width: 90, background: "var(--paper, rgba(0,0,0,.08))", borderRadius: 4 }} />
          <div style={{ height: 18, width: "70%", background: "var(--paper, rgba(0,0,0,.06))", borderRadius: 4 }} />
          <div style={{ height: 18, width: "50%", background: "var(--paper, rgba(0,0,0,.06))", borderRadius: 4 }} />
        </div>
      ))}
    </div>
  );
}
