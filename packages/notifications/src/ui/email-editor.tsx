"use client";

import { forwardRef, useImperativeHandle, useRef, useState, type ComponentType } from "react";
import { EmailEditor, type EmailEditorRef } from "@react-email/editor";
import "@react-email/editor/themes/default.css";
import {
  BoldIcon,
  Heading1Icon,
  Heading2Icon,
  ItalicIcon,
  ListIcon,
  ListOrderedIcon,
  MinusIcon,
  QuoteIcon,
  type LucideProps,
} from "lucide-react";
import { cn } from "@realm/ui/cn";

export interface EmailEditorFieldHandle {
  exportEmail: () => Promise<{ html: string; text: string; body: string }>;
}

/** The StarterKit chain subset the toolbar uses (base ChainedCommands omits these). */
interface EmailChain {
  focus(): EmailChain;
  run(): boolean;
  toggleBold(): EmailChain;
  toggleItalic(): EmailChain;
  toggleHeading(attrs: { level: number }): EmailChain;
  toggleBulletList(): EmailChain;
  toggleOrderedList(): EmailChain;
  toggleBlockquote(): EmailChain;
  setHorizontalRule(): EmailChain;
  insertContent(content: string): EmailChain;
}

interface Props {
  initialHtml: string;
  variables: string[];
  /** Fires on every edit (and once on ready) so the parent can refresh a live preview. */
  onChange?: () => void;
}

export const EmailEditorField = forwardRef<EmailEditorFieldHandle, Props>(
  function EmailEditorField({ initialHtml, variables, onChange }, ref) {
    const editorRef = useRef<EmailEditorRef>(null);
    const [ready, setReady] = useState(false);

    useImperativeHandle(ref, () => ({
      async exportEmail() {
        const [{ html, text }, body] = await Promise.all([
          editorRef.current!.getEmail(),
          editorRef.current!.getEmailHTML(),
        ]);
        return { html, text, body };
      },
    }));

    /** Run a TipTap StarterKit command against the live editor (focused). No-op
     *  until ready. StarterKit's command types aren't on the base ChainedCommands,
     *  so we narrow to the subset we use. */
    const run = (fn: (chain: EmailChain) => EmailChain) => {
      const editor = editorRef.current?.editor;
      if (!editor) return;
      fn((editor.chain() as unknown as EmailChain).focus()).run();
    };

    const insertVar = (v: string) => run((c) => c.insertContent(`{{${v}}}`));

    return (
      <div className="space-y-3">
        {variables.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-medium text-muted-foreground">Insert variable</span>
            {variables.map((v) => (
              <button
                key={v}
                type="button"
                disabled={!ready}
                onClick={() => insertVar(v)}
                className="rounded-md border bg-muted/60 px-2 py-0.5 font-mono text-xs text-foreground transition-[transform,background-color] hover:bg-accent active:scale-[0.96] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border bg-muted/30">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-0.5 border-b bg-background/70 px-2 py-1.5">
            <ToolBtn icon={BoldIcon} label="Bold" disabled={!ready} onClick={() => run((c) => c.toggleBold())} />
            <ToolBtn icon={ItalicIcon} label="Italic" disabled={!ready} onClick={() => run((c) => c.toggleItalic())} />
            <Sep />
            <ToolBtn icon={Heading1Icon} label="Heading 1" disabled={!ready} onClick={() => run((c) => c.toggleHeading({ level: 1 }))} />
            <ToolBtn icon={Heading2Icon} label="Heading 2" disabled={!ready} onClick={() => run((c) => c.toggleHeading({ level: 2 }))} />
            <Sep />
            <ToolBtn icon={ListIcon} label="Bulleted list" disabled={!ready} onClick={() => run((c) => c.toggleBulletList())} />
            <ToolBtn icon={ListOrderedIcon} label="Numbered list" disabled={!ready} onClick={() => run((c) => c.toggleOrderedList())} />
            <ToolBtn icon={QuoteIcon} label="Quote" disabled={!ready} onClick={() => run((c) => c.toggleBlockquote())} />
            <ToolBtn icon={MinusIcon} label="Divider" disabled={!ready} onClick={() => run((c) => c.setHorizontalRule())} />
            <span className="ml-auto hidden pr-1 text-xs text-muted-foreground sm:inline">
              Type <kbd className="rounded border bg-muted px-1 font-mono">/</kbd> for blocks · select text to format
            </span>
          </div>

          {/* Paper canvas — the email as recipients see it */}
          <div className="flex justify-center p-4 sm:p-6">
            <div className="tg-email-canvas w-full max-w-[680px] rounded-lg bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05),0_10px_28px_rgba(0,0,0,0.07)] ring-1 ring-black/5">
              <EmailEditor
                ref={editorRef}
                content={initialHtml || "<p></p>"}
                theme="basic"
                onReady={() => {
                  setReady(true);
                  onChange?.();
                }}
                onUpdate={() => onChange?.()}
              />
            </div>
          </div>
        </div>
      </div>
    );
  },
);

function Sep() {
  return <span className="mx-1 h-5 w-px bg-border" aria-hidden />;
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground",
        "transition-[transform,background-color,color] hover:bg-accent hover:text-foreground active:scale-[0.96]",
        "disabled:pointer-events-none disabled:opacity-40",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
