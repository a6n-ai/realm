"use client";

import { useState } from "react";
import { XplButton } from "@/components/marketing/xpl-ui";

export function CommunityJoin() {
  const [channel, setChannel] = useState<"whatsapp" | "email">("whatsapp");

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
      }}
    >
      <div className="flex gap-2 font-[family-name:var(--font-mono)] text-[10px] tracking-[0.14em] uppercase lg:text-[11px]">
        <button
          type="button"
          onClick={() => setChannel("whatsapp")}
          className={`rounded border-[1.5px] px-3 py-2 ${
            channel === "whatsapp"
              ? "border-[var(--blush)] bg-[var(--blush)] text-[var(--ink)]"
              : "border-white/50 text-white"
          }`}
        >
          WhatsApp
        </button>
        <button
          type="button"
          onClick={() => setChannel("email")}
          className={`rounded border-[1.5px] px-3 py-2 ${
            channel === "email"
              ? "border-[var(--blush)] bg-[var(--blush)] text-[var(--ink)]"
              : "border-white/50 text-white"
          }`}
        >
          Email
        </button>
      </div>
      <div className="flex flex-col gap-2 lg:flex-row lg:gap-2">
        {channel === "whatsapp" ? (
          <input type="tel" aria-label="Mobile number" placeholder="+65 mobile number" className="xpl-input flex-1" />
        ) : (
          <input type="email" aria-label="Email" placeholder="you@example.com" className="xpl-input flex-1" />
        )}
        <XplButton type="submit" variant="inverse" className="hidden h-[52px] px-[22px] lg:inline-flex">
          Join
        </XplButton>
      </div>
      <XplButton type="submit" variant="inverse" className="h-[52px] lg:hidden">
        Join the community
      </XplButton>
    </form>
  );
}

export function HomeClose() {
  return (
    <section className="flex flex-col gap-12 bg-[var(--blueprint)] px-5 pt-20 pb-14 text-white lg:gap-24 lg:px-20 lg:pt-40 lg:pb-24">
      <div className="flex flex-col items-start gap-12">
        <h2 className="xpl-disp text-[52px] leading-[0.9] tracking-[-0.04em] text-white lg:mr-[-80px] lg:text-[136px] lg:whitespace-nowrap">
          Come see what&apos;s
          <br />
          <span className="text-[var(--blush)]">happening.</span>
        </h2>
        <XplButton href="/whats-on" variant="inverse" className="h-[52px] self-stretch lg:h-auto lg:self-start lg:px-7 lg:py-[18px]">
          Explore what&apos;s on
        </XplButton>
      </div>
      <div className="grid items-center gap-4 border-t border-white/20 pt-8 lg:grid-cols-[7fr_5fr] lg:gap-12 lg:pt-12" id="community">
        <div className="flex flex-col gap-3">
          <span className="xpl-mono text-[11px] text-[var(--blush)] lg:text-xs">09 / There&apos;s a group chat.</span>
          <p className="m-0 max-w-[520px] text-base leading-[1.5] text-pretty lg:text-xl lg:leading-[1.55]">
            Evening sessions, new workshops, and the occasional nature walk.
          </p>
        </div>
        <CommunityJoin />
      </div>
    </section>
  );
}
