import { Btn, Pill } from "@/components/brutal/shared";
import { PUBLIC_ORDERING_UNAVAILABLE_MESSAGE } from "@/lib/clover/public-ordering-copy";

/** Brutalist “coming soon” card when Clover isn’t ready for public checkout. */
export function OrderingUnavailableNotice({
  title = "Ordering coming soon",
  className,
}: {
  title?: string;
  className?: string;
}) {
  return (
    <div
      className={["card card--cream", className].filter(Boolean).join(" ")}
      style={{ padding: "clamp(22px,3.5vw,32px)", opacity: 0.96 }}
    >
      <Pill variant="ink">Coming soon</Pill>
      <h2 className="display" style={{ fontSize: "clamp(1.6rem,4vw,2.2rem)", margin: "12px 0 10px" }}>
        {title}
      </h2>
      <p style={{ fontWeight: 500, opacity: 0.85, marginBottom: 20, maxWidth: 520 }}>
        {PUBLIC_ORDERING_UNAVAILABLE_MESSAGE}
      </p>
      <div className="flex wrap-gap" style={{ gap: 10 }}>
        <Btn page="eats" variant="green" size="lg">
          Browse menu
        </Btn>
        <Btn page="order" variant="ink" size="lg">
          Delivery apps
        </Btn>
      </div>
    </div>
  );
}
