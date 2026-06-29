"use client";

import { forwardRef, useImperativeHandle, useRef } from "react";
import { EmailEditor, type EmailEditorRef } from "@react-email/editor";
import "@react-email/editor/themes/default.css";

export interface EmailEditorFieldHandle {
  exportEmail: () => Promise<{ html: string; text: string; body: string }>;
}

interface Props {
  initialHtml: string;
  variables: string[];
}

export const EmailEditorField = forwardRef<EmailEditorFieldHandle, Props>(
  function EmailEditorField({ initialHtml, variables }, ref) {
    const editorRef = useRef<EmailEditorRef>(null);

    useImperativeHandle(ref, () => ({
      async exportEmail() {
        const { html, text } = await editorRef.current!.getEmail();
        const body = await editorRef.current!.getEmailHTML();
        return { html, text, body };
      },
    }));

    const insertVar = (v: string) => {
      editorRef.current?.editor?.chain().focus().insertContent(`{{${v}}}`).run();
    };

    return (
      <div className="space-y-2">
        {variables.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {variables.map((v) => (
              <button
                key={v}
                type="button"
                className="rounded bg-muted px-2 py-0.5 font-mono text-xs hover:bg-accent"
                onClick={() => insertVar(v)}
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        )}
        <div className="rounded border">
          <EmailEditor
            ref={editorRef}
            content={initialHtml || "<p></p>"}
            theme="basic"
          />
        </div>
      </div>
    );
  },
);
