"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@realm/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@realm/ui/form";
import { Input } from "@realm/ui/input";
import { updateMyProfile } from "@/app/(dashboard)/dashboard/account/actions";

const profileFormSchema = z.object({
  name: z.string().max(120, "Name is too long"),
  username: z
    .string()
    .refine((v) => v === "" || /^[a-zA-Z0-9_.]{3,30}$/.test(v), "3–30 characters: letters, numbers, _ or ."),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileForm({ name, username }: { name: string; username: string }) {
  const router = useRouter();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name, username },
  });

  const { isDirty, isSubmitting } = form.formState;

  async function onSubmit(values: ProfileFormValues) {
    try {
      await updateMyProfile({ name: values.name, username: values.username });
      toast.success("Profile updated.");
      form.reset(values);
      router.refresh();
    } catch (e) {
      form.setError("root", { message: e instanceof Error ? e.message : "Failed to update" });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid max-w-md gap-3">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Username <span className="text-muted-foreground font-normal">optional</span>
              </FormLabel>
              <FormControl>
                <Input autoComplete="username" placeholder="e.g. priya.sharma" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {form.formState.errors.root && (
          <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
        )}
        <Button
          type="submit"
          disabled={!isDirty || isSubmitting}
          className="w-full min-w-32 sm:w-auto"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving...
            </>
          ) : (
            "Save profile"
          )}
        </Button>
      </form>
    </Form>
  );
}
