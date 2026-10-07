"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { updateDisplayNameAction, updateUsernameAction } from "@/app/(customer)/me/account/actions";
import { AvatarEditor } from "./avatar-editor";

export function ProfileForm({
  image,
  name,
  username,
}: {
  image: string | null;
  name: string;
  username: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(name);
  const [handle, setHandle] = useState(username);
  const [nameError, setNameError] = useState<string | null>(null);
  const [userError, setUserError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty = displayName.trim() !== name || handle.trim() !== username;

  function save() {
    start(async () => {
      setNameError(null);
      setUserError(null);
      if (displayName.trim() !== name) {
        const res = await updateDisplayNameAction(displayName);
        if (res.error) {
          setNameError(res.error);
          return;
        }
      }
      if (handle.trim() !== username) {
        const res = await updateUsernameAction(handle);
        if (res.error) {
          setUserError(res.error);
          return;
        }
      }
      toast.success("Profile saved.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
        <p className="text-muted-foreground text-sm">Your photo, display name, and username.</p>
      </div>
      <AvatarEditor image={image} name={displayName || name || null} />
      <form
        className="grid max-w-md gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="display-name">Name</Label>
          <Input
            id="display-name"
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            aria-invalid={nameError ? true : undefined}
          />
          {nameError ? (
            <p className="text-destructive text-sm" role="alert">
              {nameError}
            </p>
          ) : null}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            autoComplete="username"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            aria-invalid={userError ? true : undefined}
            placeholder="e.g. priya.sharma"
          />
          {userError ? (
            <p className="text-destructive text-sm" role="alert">
              {userError}
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">Friends find you by this. 3–30 letters, numbers, _ or .</p>
          )}
        </div>
        <Button type="submit" disabled={pending || !dirty} className="w-fit">
          {pending ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </div>
  );
}
