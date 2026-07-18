import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: "50%",
          background: "var(--cream)",
          border: "3px solid var(--ink)",
          display: "grid",
          placeItems: "center",
          marginBottom: 6,
        }}
      >
        <Icon size={28} strokeWidth={2} />
      </div>
      <h3 className="display" style={{ fontSize: "1.2rem" }}>
        {title}
      </h3>
      <p style={{ maxWidth: 340, opacity: 0.75, fontWeight: 500 }}>{description}</p>
      {action && <div style={{ marginTop: 10 }}>{action}</div>}
    </div>
  );
}
