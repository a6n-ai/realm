"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { updateMyName } from "./actions";

const profileFormSchema = z.object({
  name: z.string().max(120, "Name is too long"),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: { name },
  });

  async function onSubmit(values: ProfileFormValues) {
    try {
      await updateMyName(values.name);
      toast.success("Name updated.");
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
        {form.formState.errors.root && (
          <p className="text-destructive text-sm">{form.formState.errors.root.message}</p>
        )}
        <Button type="submit" disabled={form.formState.isSubmitting} className="w-fit">
          Save name
        </Button>
      </form>
    </Form>
  );
}
