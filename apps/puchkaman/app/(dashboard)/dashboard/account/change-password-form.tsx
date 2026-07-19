"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { passwordSchema } from "@realm/commons";
import { authClient } from "@/lib/auth/client";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: passwordSchema,
    confirm: z.string().min(1, "Please confirm your new password"),
  })
  .refine((d) => d.newPassword === d.confirm, { message: "Passwords do not match", path: ["confirm"] });

type FormValues = z.infer<typeof schema>;

export function ChangePasswordForm() {
  const [success, setSuccess] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirm: "" },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    setSuccess(false);
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: true,
    });
    if (error) {
      setServerError("Current password is incorrect or the new password is invalid.");
      return;
    }
    setSuccess(true);
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate style={{ display: "grid", gap: 16, maxWidth: 400 }}>
      <div className={`field ${errors.currentPassword ? "field--err" : ""}`}>
        <label htmlFor="currentPassword">Current password</label>
        <input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          className="input"
          {...register("currentPassword")}
        />
        {errors.currentPassword && <span className="err-msg">{errors.currentPassword.message}</span>}
      </div>

      <div className={`field ${errors.newPassword ? "field--err" : ""}`}>
        <label htmlFor="newPassword">New password</label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          className="input"
          {...register("newPassword")}
        />
        {errors.newPassword && <span className="err-msg">{errors.newPassword.message}</span>}
      </div>

      <div className={`field ${errors.confirm ? "field--err" : ""}`}>
        <label htmlFor="confirm">Confirm new password</label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          className="input"
          {...register("confirm")}
        />
        {errors.confirm && <span className="err-msg">{errors.confirm.message}</span>}
      </div>

      {serverError && (
        <p className="err-msg" role="alert" style={{ fontSize: "0.82rem" }}>
          {serverError}
        </p>
      )}
      {success && (
        <p className="mono" style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--red-deep, var(--red))" }} role="status">
          Password updated.
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="btn btn--red"
        style={isSubmitting ? { opacity: 0.7, pointerEvents: "none", width: "fit-content" } : { width: "fit-content" }}
      >
        {isSubmitting ? "Saving…" : "Change password"}
      </button>
    </form>
  );
}
