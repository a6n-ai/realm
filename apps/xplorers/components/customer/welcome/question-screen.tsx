"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@foundry/ui/button";
import { Textarea } from "@foundry/ui/textarea";
import { cn } from "@foundry/ui/cn";
import type { CustomerQuestion } from "@/lib/services/personalization.service";
import { answerPersonalizationAction, skipPersonalizationAction } from "@/app/(customer)/me/welcome/actions";

export function QuestionScreen({ question, edit = false }: { question: CustomerQuestion; edit?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [single, setSingle] = useState<string | null>(null);
  const [multi, setMulti] = useState<string[]>([]);

  function finish(done: boolean) {
    if (done) {
      router.replace(edit ? "/me/account?section=about" : "/me");
      router.refresh();
      return;
    }
    if (edit) {
      router.replace("/me/welcome?edit=1");
    }
    router.refresh();
  }

  function submit() {
    start(async () => {
      setError(null);
      let value: string | string[];
      switch (question.type) {
        case "text":
          value = text;
          break;
        case "single":
          value = single ?? "";
          break;
        case "multi":
          value = multi;
          break;
        default: {
          const _e: never = question.type;
          return _e;
        }
      }
      const res = await answerPersonalizationAction(question.publicId, value, edit);
      if (res.error) {
        setError(res.error);
        return;
      }
      setText("");
      setSingle(null);
      setMulti([]);
      finish(Boolean(res.done));
    });
  }

  function skip() {
    start(async () => {
      setError(null);
      const res = await skipPersonalizationAction(question.publicId, edit);
      if (res.error) {
        setError(res.error);
        return;
      }
      finish(Boolean(res.done));
    });
  }

  const progress = question.total > 0 ? ((question.index + 1) / question.total) * 100 : 0;

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col gap-8 px-1 py-6">
      <div className="space-y-3">
        <p className="text-muted-foreground text-sm font-medium">
          {question.index + 1} of {question.total}
        </p>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div
            className="h-full rounded-full bg-[var(--xl-pink-600)] transition-[width] duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{question.prompt}</h1>
        {!question.required ? (
          <p className="text-muted-foreground text-sm">Optional — you can skip.</p>
        ) : null}
      </div>

      {question.type === "text" ? (
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Type your answer"
          className="text-base"
          autoFocus
        />
      ) : null}

      {question.type === "single" ? (
        <ul className="grid gap-2">
          {question.options.map((o) => {
            const on = single === o.id;
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => setSingle(o.id)}
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3.5 text-left text-base font-medium transition-colors",
                    on
                      ? "border-[var(--xl-pink-600)] bg-[var(--xl-pink-100)] text-[var(--xl-navy-900)]"
                      : "border-border bg-card hover:bg-secondary/50",
                  )}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {question.type === "multi" ? (
        <ul className="grid gap-2">
          {question.options.map((o) => {
            const on = multi.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() =>
                    setMulti((prev) => (on ? prev.filter((id) => id !== o.id) : [...prev, o.id]))
                  }
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3.5 text-left text-base font-medium transition-colors",
                    on
                      ? "border-[var(--xl-pink-600)] bg-[var(--xl-pink-100)] text-[var(--xl-navy-900)]"
                      : "border-border bg-card hover:bg-secondary/50",
                  )}
                >
                  {o.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-auto flex flex-col gap-2 sm:flex-row">
        <Button type="button" className="flex-1" disabled={pending} onClick={submit}>
          Continue
        </Button>
        {!question.required ? (
          <Button type="button" variant="outline" className="flex-1" disabled={pending} onClick={skip}>
            Skip
          </Button>
        ) : null}
      </div>
    </div>
  );
}
