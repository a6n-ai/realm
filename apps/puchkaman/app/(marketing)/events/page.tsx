"use client";

import { useState, type ChangeEvent } from "react";
import { Btn, Ph, PageBanner, Pill, SectionHead } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";

type Ev = { date: string; day: string; title: string; tag: string; spots: number; full: boolean; combo: string };

const UPCOMING: Ev[] = [
  { date: "JUN 12", day: "Thu", title: "India vs Pakistan · T20", tag: "Cricket", spots: 8, full: false, combo: "Match Day Box + Chai" },
  { date: "JUN 20", day: "Fri", title: "Champions League Final", tag: "Football", spots: 0, full: true, combo: "Fusion Sampler + Drinks" },
  { date: "JUL 04", day: "Sat", title: "IPL Watch Night", tag: "Cricket", spots: 19, full: false, combo: "Street Feast For 2" },
  { date: "JUL 18", day: "Sat", title: "Euro Cup Quarters", tag: "Football", spots: 25, full: false, combo: "Puchka Party Box" },
];

function scrollToRsvp() {
  const el = document.getElementById("rsvp");
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
}

type RForm = { name: string; phone: string; event: string; guests: string };

function RSVPForm({ preselect }: { preselect?: string }) {
  const [form, setForm] = useState<RForm>({ name: "", phone: "", event: preselect || "", guests: "2" });
  const [errors, setErrors] = useState<Partial<Record<keyof RForm, string>>>({});
  const [sent, setSent] = useState(false);
  const set = (k: keyof RForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const er: Partial<Record<keyof RForm, string>> = {};
    if (!form.name.trim()) er.name = "Required";
    if (!/^[+]?[\d\s().-]{7,}$/.test(form.phone)) er.phone = "Valid phone needed";
    if (!form.event) er.event = "Pick an event";
    setErrors(er);
    if (Object.keys(er).length === 0) setSent(true);
  };

  if (sent) {
    return (
      <div className="card card--red surface-red" style={{ color: "#fff", padding: "clamp(26px,5vw,46px)", textAlign: "center" }}>
        <div style={{ fontSize: 50, marginBottom: 8 }}>📺🎉</div>
        <h3 className="display" style={{ fontSize: "clamp(1.7rem,5vw,2.6rem)" }}>Spot Reserved!</h3>
        <p style={{ fontWeight: 500, margin: "12px auto 0", maxWidth: 400 }}>
          See you there, {form.name.split(" ")[0]}! We&apos;ve held <strong>{form.guests} seat(s)</strong> for <strong>{form.event}</strong>. We&apos;ll
          text {form.phone} to confirm.
        </p>
        <Btn onClick={() => { setSent(false); setForm({ name: "", phone: "", event: "", guests: "2" }); }} variant="yellow" style={{ marginTop: 22 }}>
          Reserve Another
        </Btn>
      </div>
    );
  }

  const open = UPCOMING.filter((e) => !e.full);
  return (
    <form onSubmit={submit} className="card" style={{ background: "var(--white)", padding: "clamp(22px,4vw,34px)" }} noValidate>
      <h3 className="display" style={{ fontSize: "1.6rem", marginBottom: 18 }}>Reserve Your Spot</h3>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 16 }}>
        <div className={`field ${errors.name ? "field--err" : ""}`}>
          <label>Name *</label>
          <input className="input" value={form.name} onChange={set("name")} placeholder="Your name" />
          {errors.name && <span className="err-msg">↑ {errors.name}</span>}
        </div>
        <div className={`field ${errors.phone ? "field--err" : ""}`}>
          <label>Phone *</label>
          <input className="input" type="tel" value={form.phone} onChange={set("phone")} placeholder="(416) 000-0000" />
          {errors.phone && <span className="err-msg">↑ {errors.phone}</span>}
        </div>
        <div className={`field ${errors.event ? "field--err" : ""}`}>
          <label>Which Event *</label>
          <select className="select" value={form.event} onChange={set("event")}>
            <option value="">Select…</option>
            {open.map((e) => (
              <option key={e.title} value={e.title}>
                {e.date} · {e.title}
              </option>
            ))}
          </select>
          {errors.event && <span className="err-msg">↑ {errors.event}</span>}
        </div>
        <div className="field">
          <label>Guests</label>
          <select className="select" value={form.guests} onChange={set("guests")}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" className="btn btn--ink btn--lg btn--block" style={{ marginTop: 20 }}>
        Reserve Your Spot →
      </button>
      <p className="mono" style={{ fontSize: "0.72rem", textAlign: "center", marginTop: 12, opacity: 0.6 }}>
        ⚠ Limited seating · 30–35 people per event
      </p>
    </form>
  );
}

export default function EventsPage() {
  return (
    <div>
      <PageBanner
        kicker="Scarborough's Fan Hub"
        title="Watch Parties & Game Nights"
        sub="Cricket, football & big-match nights with live puchkas, event combos and serious energy. Limited seating."
        bg="var(--ink)"
        color="var(--cream)"
      />

      {/* upcoming */}
      <section className="section-pad" style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <SectionHead kicker="Mark Your Calendar" title="Upcoming Watch Parties" sub="Only 30–35 seats per night. When it's full, it's full." />
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {UPCOMING.map((ev, i) => (
              <Reveal key={ev.title} delay={i * 60}>
                <div
                  className="card"
                  style={{
                    overflow: "hidden",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    background: ev.full ? "var(--cream)" : "var(--white)",
                    opacity: ev.full ? 0.92 : 1,
                  }}
                >
                  <div className="flex" style={{ borderBottom: "var(--border)" }}>
                    <div
                      style={{
                        background: ev.full ? "var(--ink)" : "var(--red)",
                        color: "#fff",
                        padding: "16px 18px",
                        textAlign: "center",
                        borderRight: "var(--border)",
                        minWidth: 96,
                      }}
                    >
                      <div className="mono" style={{ fontSize: "0.7rem", opacity: 0.85 }}>{ev.day}</div>
                      <div className="display" style={{ fontSize: "1.4rem", lineHeight: 1 }}>{ev.date}</div>
                    </div>
                    <div className="flex center" style={{ padding: "0 16px", flex: 1, justifyContent: "space-between" }}>
                      <Pill variant={ev.tag === "Cricket" ? "mint" : "red"}>
                        {ev.tag === "Cricket" ? "🏏" : "⚽"} {ev.tag}
                      </Pill>
                      {ev.full ? <Pill variant="ink">Sold Out</Pill> : <Pill variant="yellow">{ev.spots} spots left</Pill>}
                    </div>
                  </div>
                  <div style={{ padding: "18px 18px 20px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <h3 style={{ fontSize: "1.45rem", marginBottom: 10 }}>{ev.title}</h3>
                    <p className="mono" style={{ fontSize: "0.78rem", opacity: 0.75, marginBottom: 16 }}>🍱 {ev.combo}</p>
                    <div style={{ marginTop: "auto" }}>
                      {ev.full ? (
                        <span className="btn btn--block" style={{ background: "var(--cream)", opacity: 0.6, cursor: "not-allowed", boxShadow: "none" }}>
                          Sold Out
                        </span>
                      ) : (
                        <button type="button" onClick={scrollToRsvp} className="btn btn--red btn--block">
                          Reserve →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* combos + gallery */}
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <div className="hero-grid" style={{ display: "grid", gap: 40, alignItems: "center" }}>
            <div>
              <span className="tape kicker">Game-Day Fuel</span>
              <h2 className="display" style={{ fontSize: "clamp(1.9rem,5vw,3rem)", marginTop: 14 }}>Event Food Combos</h2>
              <p style={{ fontWeight: 500, fontSize: "1.08rem", marginTop: 14, maxWidth: 460 }}>
                Every watch party comes with shareable combo boxes — puchkas, rolls, momos and drinks built to keep the whole crew fed through extra
                time.
              </p>
              <div className="flex wrap-gap" style={{ marginTop: 22 }}>
                <Btn page="menu" variant="red" size="lg">See Combo Boxes →</Btn>
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Ph label="Past event — crowd cheering" ratio="1 / 1" mod="rotate-l" />
              <Ph label="Combo box spread" ratio="1 / 1" mod="rotate-r" style={{ marginTop: 22 }} />
              <Ph label="Big screen night" ratio="1 / 1" mod="rotate-r" />
              <Ph label="Live puchka counter" ratio="1 / 1" mod="rotate-l" style={{ marginTop: -8 }} />
            </div>
          </div>
        </div>
      </section>

      {/* RSVP */}
      <section id="rsvp" className="section-pad surface-red" style={{ background: "var(--red)", scrollMarginTop: 100 }}>
        <div className="wrap" style={{ maxWidth: 760 }}>
          <div style={{ textAlign: "center", color: "#fff", marginBottom: 26 }}>
            <span className="tape kicker" style={{ background: "var(--ink)", color: "var(--yellow)" }}>RSVP</span>
            <h2 className="display" style={{ fontSize: "clamp(1.9rem,5.5vw,3rem)", marginTop: 14 }}>Don&apos;t Watch It Alone</h2>
          </div>
          <RSVPForm />
        </div>
      </section>
    </div>
  );
}
