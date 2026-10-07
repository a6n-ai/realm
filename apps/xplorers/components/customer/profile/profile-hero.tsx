"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckIcon, CopyIcon } from "lucide-react";
import { cn } from "@foundry/ui/cn";

function initials(name: string | null, username: string | null) {
  const src = (name ?? username ?? "?").trim();
  return src
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function ProfileHero({
  name,
  username,
  image,
  editHref = "/me/account?section=profile",
}: {
  name: string | null;
  username: string | null;
  image: string | null;
  editHref?: string;
}) {
  const [copied, setCopied] = useState(false);
  const display = name?.trim() || username || "Your profile";

  async function copyUsername() {
    if (!username) return;
    await navigator.clipboard.writeText(username);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <header className="flex flex-col items-center gap-4 pt-2 pb-1 text-center">
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element -- file URL from our store
        <img
          src={image}
          alt=""
          className="border-border size-24 rounded-full border object-cover shadow-sm"
        />
      ) : (
        <span
          aria-hidden
          className="bg-secondary text-secondary-foreground grid size-24 place-items-center rounded-full text-2xl font-bold tracking-tight"
        >
          {initials(name, username)}
        </span>
      )}

      <div className="min-w-0 space-y-1.5">
        <p className="text-xl font-extrabold tracking-tight md:text-2xl" style={{ fontFamily: "var(--font-display)" }}>
          {display}
        </p>
        {username ? (
          <button
            type="button"
            onClick={() => void copyUsername()}
            className={cn(
              "text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-base font-medium transition-colors",
              "active:scale-[0.98]",
            )}
            aria-label={copied ? "Username copied" : `Copy username ${username}`}
          >
            <span className="truncate">@{username}</span>
            {copied ? (
              <CheckIcon className="size-4 shrink-0 text-emerald-600" aria-hidden />
            ) : (
              <CopyIcon className="size-3.5 shrink-0 opacity-70" aria-hidden />
            )}
          </button>
        ) : (
          <p className="text-muted-foreground text-sm">
            Set a username in{" "}
            <Link href={editHref} className="text-foreground underline underline-offset-2">
              Settings
            </Link>
          </p>
        )}
      </div>
    </header>
  );
}
