"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

const emailSchema = z.object({ newEmail: z.email("Enter a valid email") });
const otpSchema = z.object({ code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code") });

type EmailValues = z.infer<typeof emailSchema>;
type OtpValues = z.infer<typeof otpSchema>;

/**
 * Decoupled OTP email change with current-email confirmation (verifyCurrentEmail: true):
 *  1. enter new email  -> code sent to the CURRENT address
 *  2. enter that code  -> requestEmailChange verifies it, sends a code to the NEW address
 *  3. enter that code  -> changeEmail confirms and switches the account email
 */
export function ChangeEmailForm({ currentEmail }: { currentEmail?: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "current" | "new">("email");
  const [newEmail, setNewEmail] = useState("");
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const emailForm = useForm<EmailValues>({ resolver: zodResolver(emailSchema), defaultValues: { newEmail: "" } });
  const currentForm = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { code: "" } });
  const newForm = useForm<OtpValues>({ resolver: zodResolver(otpSchema), defaultValues: { code: "" } });

  async function startChange(values: EmailValues) {
    setServerError(null);
    if (!currentEmail) {
      setServerError("No current email on file.");
      return;
    }
    const { error } = await authClient.emailOtp.sendVerificationOtp({
      email: currentEmail,
      type: "email-verification",
    });
    if (error) {
      setServerError("Could not start the change. Try again.");
      return;
    }
    setNewEmail(values.newEmail.trim());
    setStep("current");
  }

  async function confirmCurrent(values: OtpValues) {
    setServerError(null);
    const { error } = await authClient.emailOtp.requestEmailChange({ newEmail, otp: values.code });
    if (error) {
      setServerError("That code is invalid or expired.");
      return;
    }
    setStep("new");
  }

  async function confirmNew(values: OtpValues) {
    setServerError(null);
    const { error } = await authClient.emailOtp.changeEmail({ newEmail, otp: values.code });
    if (error) {
      setServerError("That code is invalid or expired.");
      return;
    }
    setSuccess(true);
    setStep("email");
    emailForm.reset();
    currentForm.reset();
    newForm.reset();
    router.refresh();
  }

  if (step === "current") {
    return (
      <form
        onSubmit={currentForm.handleSubmit(confirmCurrent)}
        noValidate
        style={{ display: "grid", gap: 16, maxWidth: 400 }}
      >
        <p style={{ opacity: 0.7, fontWeight: 500, fontSize: "0.85rem" }}>
          We sent a 6-digit code to your current email, {currentEmail ?? "on file"}. Enter it to confirm the change.
        </p>
        <div className={`field ${currentForm.formState.errors.code ? "field--err" : ""}`}>
          <label htmlFor="current-code">Verification code</label>
          <input
            id="current-code"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="123456"
            className="input"
            {...currentForm.register("code")}
          />
          {currentForm.formState.errors.code && (
            <span className="err-msg">{currentForm.formState.errors.code.message}</span>
          )}
        </div>
        {serverError && (
          <p className="err-msg" role="alert" style={{ fontSize: "0.82rem" }}>
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={currentForm.formState.isSubmitting}
          className="btn btn--red"
          style={
            currentForm.formState.isSubmitting
              ? { opacity: 0.7, pointerEvents: "none", width: "fit-content" }
              : { width: "fit-content" }
          }
        >
          {currentForm.formState.isSubmitting ? "Verifying…" : "Verify"}
        </button>
      </form>
    );
  }

  if (step === "new") {
    return (
      <form onSubmit={newForm.handleSubmit(confirmNew)} noValidate style={{ display: "grid", gap: 16, maxWidth: 400 }}>
        <p style={{ opacity: 0.7, fontWeight: 500, fontSize: "0.85rem" }}>
          We sent a 6-digit code to {newEmail}. Enter it to finish switching your email.
        </p>
        <div className={`field ${newForm.formState.errors.code ? "field--err" : ""}`}>
          <label htmlFor="new-code">Verification code</label>
          <input
            id="new-code"
            inputMode="numeric"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="123456"
            className="input"
            {...newForm.register("code")}
          />
          {newForm.formState.errors.code && <span className="err-msg">{newForm.formState.errors.code.message}</span>}
        </div>
        {serverError && (
          <p className="err-msg" role="alert" style={{ fontSize: "0.82rem" }}>
            {serverError}
          </p>
        )}
        <button
          type="submit"
          disabled={newForm.formState.isSubmitting}
          className="btn btn--red"
          style={
            newForm.formState.isSubmitting
              ? { opacity: 0.7, pointerEvents: "none", width: "fit-content" }
              : { width: "fit-content" }
          }
        >
          {newForm.formState.isSubmitting ? "Saving…" : "Change email"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={emailForm.handleSubmit(startChange)} noValidate style={{ display: "grid", gap: 16, maxWidth: 400 }}>
      <div className={`field ${emailForm.formState.errors.newEmail ? "field--err" : ""}`}>
        <label htmlFor="newEmail">New email address</label>
        <input
          id="newEmail"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="input"
          {...emailForm.register("newEmail")}
        />
        {emailForm.formState.errors.newEmail && (
          <span className="err-msg">{emailForm.formState.errors.newEmail.message}</span>
        )}
      </div>
      {serverError && (
        <p className="err-msg" role="alert" style={{ fontSize: "0.82rem" }}>
          {serverError}
        </p>
      )}
      {success && (
        <p
          className="mono"
          style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--red-deep, var(--red))" }}
          role="status"
        >
          Email updated.
        </p>
      )}
      <button
        type="submit"
        disabled={emailForm.formState.isSubmitting}
        className="btn btn--red"
        style={
          emailForm.formState.isSubmitting
            ? { opacity: 0.7, pointerEvents: "none", width: "fit-content" }
            : { width: "fit-content" }
        }
      >
        {emailForm.formState.isSubmitting ? "Starting…" : "Change email"}
      </button>
    </form>
  );
}
