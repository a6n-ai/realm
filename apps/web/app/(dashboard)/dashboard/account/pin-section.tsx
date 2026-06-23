"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { pinSchema } from "@tiffin/commons";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { setMyPin, removeMyPin } from "./actions";

const setSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPin: pinSchema,
    confirm: z.string().min(1, "Please confirm your PIN"),
  })
  .refine((d) => d.newPin === d.confirm, { message: "PINs do not match", path: ["confirm"] });

type SetValues = z.infer<typeof setSchema>;
const removeSchema = z.object({ currentPassword: z.string().min(1, "Current password is required") });
type RemoveValues = z.infer<typeof removeSchema>;

export function PinSection({ hasPin }: { hasPin: boolean }) {
  const [showPw, setShowPw] = useState(false);

  const setForm = useForm<SetValues>({
    resolver: zodResolver(setSchema),
    defaultValues: { currentPassword: "", newPin: "", confirm: "" },
  });
  const removeForm = useForm<RemoveValues>({
    resolver: zodResolver(removeSchema),
    defaultValues: { currentPassword: "" },
  });

  async function onSet(values: SetValues) {
    const res = await setMyPin(values.currentPassword, values.newPin);
    if (!res.ok) {
      setForm.setError("root", { message: res.message ?? "Could not set the PIN." });
      return;
    }
    toast.success(hasPin ? "PIN updated." : "PIN set.");
    setForm.reset();
  }

  async function onRemove(values: RemoveValues) {
    const res = await removeMyPin(values.currentPassword);
    if (!res.ok) {
      removeForm.setError("root", { message: res.message ?? "Could not remove the PIN." });
      return;
    }
    toast.success("PIN removed.");
    removeForm.reset();
  }

  const pinInput = (field: { value: string; onChange: (v: string) => void; name: string }) => (
    <Input
      type="password"
      inputMode="numeric"
      maxLength={4}
      autoComplete="off"
      value={field.value}
      onChange={(e) => field.onChange(e.target.value.replace(/\D/g, ""))}
      name={field.name}
    />
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">{hasPin ? "Update PIN" : "Set a PIN"}</h3>
        <p className="text-muted-foreground text-sm">A 4-digit PIN re-unlocks your session without a full sign-in.</p>
      </div>

      <Form {...setForm}>
        <form onSubmit={setForm.handleSubmit(onSet)} className="grid max-w-md gap-3">
          <FormField
            control={setForm.control}
            name="currentPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Current password</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input type={showPw ? "text" : "password"} {...field} />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
                      onClick={() => setShowPw((v) => !v)}
                    >
                      {showPw ? "Hide" : "Show"}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={setForm.control}
            name="newPin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New PIN</FormLabel>
                <FormControl>{pinInput(field)}</FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={setForm.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm PIN</FormLabel>
                <FormControl>{pinInput(field)}</FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {setForm.formState.errors.root && (
            <p className="text-destructive text-sm">{setForm.formState.errors.root.message}</p>
          )}
          <Button type="submit" disabled={setForm.formState.isSubmitting} className="w-fit">
            {hasPin ? "Update PIN" : "Set PIN"}
          </Button>
        </form>
      </Form>

      {hasPin && (
        <Form {...removeForm}>
          <form onSubmit={removeForm.handleSubmit(onRemove)} className="grid max-w-md gap-3">
            <FormField
              control={removeForm.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {removeForm.formState.errors.root && (
              <p className="text-destructive text-sm">{removeForm.formState.errors.root.message}</p>
            )}
            <Button type="submit" variant="destructive" disabled={removeForm.formState.isSubmitting} className="w-fit">
              Remove PIN
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}
