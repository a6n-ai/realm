"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import { InfoBar } from "@/components/kit";
import { validatePostal } from "@/lib/wizard/actions";
import { parseWindow } from "@/lib/landing/areas";
import { normalizePostal } from "@/lib/catalog/postal";
import { CONTACT_EMAIL } from "@/lib/brand";
import { wizardSession, type CheckedPostal as Served } from "@/lib/wizard/session";

// "Check your area" (do we deliver to you?) near the top of the builder, answered before the visitor puts in any effort. A served
// postal code is kept for the tab (checkout's new-address form starts with it) and shows as one line from then on.
// Checkout still asks for the full address and checks the zone itself.
type State = { status: "idle" } | { status: "checking" } | ({ status: "served" } & Served) | { status: "unserved" } | { status: "invalid" };

const pretty = (p: string) => (p.length === 6 ? `${p.slice(0, 3)} ${p.slice(3)}` : p);

export function DeliveryCheck({ onlyWhenChecked = false }: { onlyWhenChecked?: boolean }) {
  const [postal, setPostal] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  useEffect(() => {
    const saved = wizardSession.postal();
    // sessionStorage is client-only.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved?.postal && saved.area) setState({ status: "served", postal: saved.postal, area: saved.area, window: saved.window ?? null });
  }, []);

  async function check() {
    const code = normalizePostal(postal);
    if (!code) return setState({ status: "invalid" });
    setState({ status: "checking" });
    try {
      const r = await validatePostal(code);
      if (!r.served || !r.zone) return setState({ status: "unserved" });
      const w = parseWindow(r.zone.slotWindow);
      const served: Served = { postal: pretty(code), area: r.zone.name, window: w ? `${w.from} to ${w.to}` : null };
      wizardSession.savePostal(served);
      setState({ status: "served", ...served });
    } catch {
      setState({ status: "idle" });
    }
  }

  if (state.status === "served") {
    return (
      <InfoBar
        role="status"
        tint="green"
        icon={<MapPin />}
        action={
          <button
            type="button"
            className="px-2 py-1 font-semibold text-primary underline-offset-4 hover:underline"
            onClick={() => {
              wizardSession.clearPostal();
              setPostal(state.postal);
              setState({ status: "idle" });
            }}
          >
            Change
          </button>
        }
      >
        <span className="min-w-0 truncate">
          Delivering to <strong className="font-semibold text-foreground">{state.area}</strong>
          {state.window ? <span className="text-muted-foreground">, {state.window}</span> : null}
        </span>
      </InfoBar>
    );
  }
  if (onlyWhenChecked) return null;

  const busy = state.status === "checking";
  const message =
    state.status === "invalid" ? "Enter a postal code like M5V 2T6." : state.status === "unserved" ? `We don't deliver there yet. Email ${CONTACT_EMAIL} and we'll tell you when we do.` : null;
  return (
    <form
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void check();
      }}
    >
      <InfoBar
        tint="blue"
        icon={<MapPin />}
        action={
          <button type="submit" disabled={busy} className="px-2 py-1.5 font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline disabled:opacity-60">
            {busy ? "Checking" : "Check"}
          </button>
        }
      >
        <label htmlFor="delivery-postal" className="min-w-0 flex-1 truncate font-semibold">Check your area</label>
        <input
          id="delivery-postal"
          autoComplete="postal-code"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="M5V 2T6"
          value={postal}
          aria-invalid={message != null}
          aria-describedby={message ? "delivery-postal-msg" : undefined}
          onChange={(e) => {
            setPostal(e.target.value);
            if (state.status !== "idle") setState({ status: "idle" });
          }}
          className="w-24 shrink-0 rounded-lg bg-muted px-2.5 py-1 text-footnote uppercase outline-none placeholder:normal-case placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </InfoBar>
      {message ? (
        <p id="delivery-postal-msg" role="alert" className={`px-3 text-footnote ${state.status === "unserved" ? "text-foreground" : "text-[#be123c] dark:text-[#fda4af]"}`}>
          {message}
        </p>
      ) : null}
    </form>
  );
}
