"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Input } from "@foundry/ui/input";
import { Label } from "@foundry/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@foundry/ui/select";
import { Textarea } from "@foundry/ui/textarea";
import type { QuestionDto } from "@/lib/services/personalization.service";
import {
  createQuestionAction,
  deleteQuestionAction,
  reorderQuestionsAction,
  updateQuestionAction,
} from "./actions";

const TYPE_LABEL: Record<QuestionDto["type"], string> = {
  single: "Single choice",
  multi: "Multi choice",
  text: "Text",
};

function OptionsEditor({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label>Options</Label>
      {value.map((opt, i) => (
        <div key={i} className="flex gap-2">
          <Input
            value={opt}
            onChange={(e) => {
              const next = [...value];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`Option ${i + 1}`}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={value.length <= 2}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
            aria-label="Remove option"
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => onChange([...value, ""])}>
        <PlusIcon className="size-4" />
        Add option
      </Button>
    </div>
  );
}

function QuestionEditor({
  initial,
  onCancel,
  onSaved,
}: {
  initial?: QuestionDto;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [type, setType] = useState<QuestionDto["type"]>(initial?.type ?? "single");
  const [options, setOptions] = useState<string[]>(
    initial?.options?.length ? initial.options.map((o) => o.label) : ["", ""],
  );
  const [required, setRequired] = useState(initial?.required ?? true);
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      setError(null);
      const payload = {
        prompt,
        type,
        options: type === "text" ? [] : options,
        required,
        active,
      };
      const res = initial
        ? await updateQuestionAction(initial.publicId, payload)
        : await createQuestionAction(payload);
      if (res.error) {
        setError(res.error);
        return;
      }
      onSaved();
    });
  }

  return (
    <div className="border-border bg-card grid gap-4 rounded-[var(--radius)] border p-4">
      <div className="grid gap-2">
        <Label htmlFor="pq-prompt">Question</Label>
        <Textarea
          id="pq-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="One question per screen — e.g. How did you hear about us?"
        />
      </div>
      <div className="grid gap-2">
        <Label>Answer type</Label>
        <Select value={type} onValueChange={(v) => setType(v as QuestionDto["type"])}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="single">Single choice (MCQ)</SelectItem>
            <SelectItem value="multi">Multi select (MCQ)</SelectItem>
            <SelectItem value="text">Text field</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {type !== "text" ? <OptionsEditor value={options} onChange={setOptions} /> : null}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
          Required
        </label>
        {initial ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (shown to new customers)
          </label>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={pending}>
          {initial ? "Save" : "Add question"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function QuestionBuilder({ questions }: { questions: QuestionDto[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [pending, start] = useTransition();
  const order = useMemo(() => questions.map((q) => q.publicId), [questions]);

  function refresh() {
    setEditing(null);
    router.refresh();
  }

  function move(publicId: string, dir: -1 | 1) {
    const i = order.indexOf(publicId);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    const next = [...order];
    const [item] = next.splice(i, 1);
    next.splice(j, 0, item!);
    start(async () => {
      await reorderQuestionsAction(next);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Each question is its own screen after signup. Drag order with the arrows — customers see them top to bottom.
      </p>

      <ul className="grid gap-3">
        {questions.map((q, i) => (
          <li key={q.publicId} className="border-border bg-card rounded-[var(--radius)] border p-4">
            {editing === q.publicId ? (
              <QuestionEditor initial={q} onCancel={() => setEditing(null)} onSaved={refresh} />
            ) : (
              <div className="flex items-start gap-3">
                <div className="text-muted-foreground flex shrink-0 flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending || i === 0}
                    onClick={() => move(q.publicId, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUpIcon className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={pending || i === questions.length - 1}
                    onClick={() => move(q.publicId, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDownIcon className="size-4" />
                  </Button>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                      Screen {i + 1}
                    </span>
                    <span className="bg-muted rounded-full px-2 py-0.5 text-xs font-medium">{TYPE_LABEL[q.type]}</span>
                    {!q.active ? (
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs">Off</span>
                    ) : null}
                    {q.required ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary">
                        Required
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">Optional</span>
                    )}
                  </div>
                  <p className="mt-1 font-medium">{q.prompt}</p>
                  {q.type !== "text" && q.options.length > 0 ? (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {q.options.map((o) => o.label).join(" · ")}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(q.publicId)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      start(async () => {
                        await deleteQuestionAction(q.publicId);
                        router.refresh();
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>

      {editing === "new" ? (
        <QuestionEditor onCancel={() => setEditing(null)} onSaved={refresh} />
      ) : (
        <Button type="button" variant="outline" className="w-fit" onClick={() => setEditing("new")}>
          <PlusIcon className="size-4" />
          Add question screen
        </Button>
      )}
    </div>
  );
}
