"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { EyeIcon, EyeOffIcon, LockIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import type { Country } from "react-phone-number-input";
import { z } from "zod";
import { signIn } from "@/lib/auth/client";
import { clearLockSession } from "@/lib/auth/lock-actions";
import { PinOtp } from "@/components/pin-otp";
import { Button } from "@realm/ui/button";
import { Card, CardContent } from "@realm/ui/card";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { PhoneInput } from "@realm/ui/phone-input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@realm/ui/tabs";
import { verifyPinAction } from "./actions";

// Single auth screen. Password by default; when a locked session with a PIN
// exists (`canUsePin`), it defaults to PIN entry and offers an in-place toggle
// to password (and vice-versa). No navigation between the two → no back button.
type Mode = "password" | "pin";

export function AuthForm({ canUsePin, defaultCountry }: { canUsePin: boolean; defaultCountry: Country }) {
  // A locked session (PIN available) opens straight in PIN mode; the panel still
  // offers "Sign in with password instead" to switch. Otherwise, password.
  const [mode, setMode] = useState<Mode>(canUsePin ? "pin" : "password");

  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          <div className="p-6 md:p-8">
            {mode === "pin" ? (
              <PinPanel onUsePassword={() => setMode("password")} />
            ) : (
              <PasswordPanel canUsePin={canUsePin} defaultCountry={defaultCountry} onUsePin={() => setMode("pin")} />
            )}
          </div>
          <div className="bg-muted text-muted-foreground relative hidden flex-col items-center justify-center gap-2 p-8 md:flex">
            <span className="text-foreground text-2xl font-bold">Tiffin Grab</span>
            <p className="text-balance text-center text-sm">
              Fresh tiffin meals, delivered on your schedule.
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="text-muted-foreground hover:[&_a]:text-primary text-balance text-center text-xs [&_a]:underline [&_a]:underline-offset-4">
        By continuing, you agree to our <Link href="/terms">Terms of Service</Link>{" "}
        and <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </div>
  );
}

const passwordSchema = z.object({
  identifier: z.string().min(1, "Phone or email is required"),
  password: z.string().min(1, "Password is required"),
});

function PasswordPanel({ canUsePin, defaultCountry, onUsePin }: { canUsePin: boolean; defaultCountry: Country; onUsePin: () => void }) {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  // Phone/email tab selects the sign-in method; the identifier field is shared.
  const [method, setMethod] = useState<"phone" | "email">("phone");
  const form = useForm<z.infer<typeof passwordSchema>>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { identifier: "", password: "" },
  });

  // Switching tabs clears the identifier so a half-typed phone doesn't leak into
  // the email field (and vice-versa).
  const switchMethod = (next: string) => {
    if (next !== "phone" && next !== "email") return;
    setMethod(next);
    form.setValue("identifier", "");
    form.clearErrors("identifier");
    setError(null);
  };

  async function onSubmit(values: z.infer<typeof passwordSchema>) {
    setError(null);
    try {
      const { identifier, password } = values;
      const result = method === "phone"
        ? await signIn.phoneNumber({ phoneNumber: identifier, password })
        : await signIn.email({ email: identifier, password });
      if (result?.error) {
        setError("Invalid credentials");
        return;
      }
    } catch {
      setError("Invalid credentials");
      return;
    }
    // A full sign-in clears any prior lock so we don't bounce to a PIN prompt.
    await clearLockSession();
    router.push(params.get("callbackUrl") ?? "/dashboard");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center text-center">
            <h1 className="text-2xl font-bold">Welcome back</h1>
            <p className="text-muted-foreground text-balance">Sign in to your Tiffin Grab account</p>
          </div>
          {canUsePin && (
            <Button type="button" variant="outline" className="gap-2" onClick={onUsePin}>
              <LockIcon className="size-4" />
              Unlock with your PIN instead
            </Button>
          )}
          <Tabs value={method} onValueChange={switchMethod} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="phone">Phone</TabsTrigger>
              <TabsTrigger value="email">Email</TabsTrigger>
            </TabsList>
            <TabsContent value="phone">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone number</FormLabel>
                    <FormControl>
                      <PhoneInput
                        autoComplete="tel"
                        defaultCountry={defaultCountry}
                        value={field.value}
                        onChange={(v) => field.onChange(v ?? "")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>
            <TabsContent value="email">
              <FormField
                control={form.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" autoComplete="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </TabsContent>
          </Tabs>
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center">
                  <FormLabel>Password</FormLabel>
                  <Link href="/forgot-password" className="ml-auto text-sm underline-offset-2 hover:underline">
                    Forgot your password?
                  </Link>
                </div>
                <FormControl>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      className="pr-10"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      aria-pressed={showPassword}
                      className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 flex w-10 items-center justify-center"
                    >
                      {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            Sign in
          </Button>
          <div className="text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Sign up
            </Link>
          </div>
        </div>
      </form>
    </Form>
  );
}

function PinPanel({ onUsePassword }: { onUsePassword: () => void }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function verify(value: string) {
    setPending(true);
    setError(null);
    const res = await verifyPinAction(value);
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
      return;
    }
    if (res.forcePassword) {
      // Too many attempts — the action signed us out. Fall back to password.
      onUsePassword();
      return;
    }
    setError("Incorrect PIN. Try again.");
    setPin("");
    setPending(false);
  }

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="bg-primary text-primary-foreground flex size-10 items-center justify-center rounded-md">
          <LockIcon className="size-5" />
        </div>
        <h1 className="text-lg font-semibold">Session locked</h1>
        <p className="text-muted-foreground text-sm">Enter your PIN to continue.</p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); verify(pin); }} className="flex w-full flex-col items-center gap-3">
        <PinOtp value={pin} onChange={setPin} onComplete={verify} autoFocus disabled={pending} aria-label="PIN" />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" disabled={pending || pin.length !== 4} className="w-full">
          Unlock
        </Button>
        <button type="button" className="text-muted-foreground text-sm underline" onClick={onUsePassword}>
          Sign in with password instead
        </button>
      </form>
    </div>
  );
}
