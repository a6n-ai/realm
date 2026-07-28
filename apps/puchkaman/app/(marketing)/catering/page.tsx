"use client";

import { useState, type ChangeEvent } from "react";
import Image from "next/image";
import { Btn, Ph, PageBanner, SectionHead } from "@/components/brutal/shared";
import { Reveal } from "@/components/brutal/reveal";

const EVENT_TYPES = ["Birthday Party", "Office Event", "Wedding", "Private Party", "Community Event", "Watch Party", "Other"];

const STATIONS: [string, string, string, string?][] = [
  ["💧", "Live Puchka Station", "A server assembling fresh puchkas to order — the showstopper at any event.", "/catering/live-puchka-station.png"],
  ["🥗", "Live Chaat Station", "Bhel, sev puri, dahi bhalla made fresh in front of your guests.", "/catering/live-chaat-station.png"],
  ["🌯", "Kathi Roll / Street Food", "Rolls, vada pav, momos & more cooked on-site.", "/catering/kathi-roll-station.png"],
];

const OCCASIONS = ["Birthday Parties", "Office Events", "Weddings", "Private Parties", "Community Events", "Watch Parties"];
const OCCASION_EMOJI = ["🎂", "💼", "💍", "🎊", "🤝", "📺"];

type CForm = { name: string; phone: string; email: string; date: string; location: string; guests: string; type: string; allergies: string; message: string };
const EMPTY: CForm = { name: "", phone: "", email: "", date: "", location: "", guests: "", type: "", allergies: "", message: "" };
const REQUIRED: (keyof CForm)[] = ["name", "phone", "email", "date", "location", "guests", "type"];

// The business's WhatsApp number — there's no WhatsApp Business API account
// wired up (that needs Meta/Twilio credentials), so this sends the request
// straight from the customer's own WhatsApp app instead of via any backend.
const CATERING_WHATSAPP_NUMBER = "16472449813";

function whatsAppUrlFor(form: CForm): string {
  const lines = [
    "New catering quote request",
    `Name: ${form.name}`,
    `Phone: ${form.phone}`,
    `Email: ${form.email}`,
    `Event date: ${form.date}`,
    `Location: ${form.location}`,
    `Guests: ${form.guests}`,
    `Type: ${form.type}`,
    form.allergies.trim() && `Food allergies: ${form.allergies.trim()}`,
    form.message.trim() && `Message: ${form.message.trim()}`,
  ].filter(Boolean);
  return `https://wa.me/${CATERING_WHATSAPP_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`;
}

// Hoisted out of the form component so React keeps the input mounted across
// re-renders (a Field defined inside render drops focus on every keystroke).
function Field({
  k,
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  options,
  full,
}: {
  k: keyof CForm;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  options?: string[];
  full?: boolean;
}) {
  return (
    <div className={`field ${error ? "field--err" : ""}`} style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <label>
        {label}
        {REQUIRED.includes(k) && <span style={{ color: "var(--red)" }}> *</span>}
      </label>
      {options ? (
        <select className="select" value={value} onChange={onChange}>
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea className="textarea" value={value} onChange={onChange} placeholder={placeholder} />
      ) : (
        <input className="input" type={type} value={value} onChange={onChange} placeholder={placeholder} min={type === "number" ? 1 : undefined} />
      )}
      {error && <span className="err-msg">↑ {error}</span>}
    </div>
  );
}

function CateringForm() {
  const [form, setForm] = useState<CForm>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof CForm, string>>>({});
  const [sent, setSent] = useState(false);

  const set = (k: keyof CForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const validate = () => {
    const er: Partial<Record<keyof CForm, string>> = {};
    if (!form.name.trim()) er.name = "Required";
    if (!/^[+]?[\d\s().-]{7,}$/.test(form.phone)) er.phone = "Enter a valid phone";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) er.email = "Enter a valid email";
    if (!form.date) er.date = "Pick a date";
    if (!form.location.trim()) er.location = "Required";
    if (!form.guests || +form.guests < 1) er.guests = "How many guests?";
    if (!form.type) er.type = "Choose one";
    setErrors(er);
    return Object.keys(er).length === 0;
  };

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (validate()) {
      // Opened synchronously inside this click-triggered handler so browsers
      // don't treat it as an unsolicited popup.
      window.open(whatsAppUrlFor(form), "_blank", "noopener,noreferrer");
      // Fire-and-forget: email is a best-effort second channel. A failure here
      // (logged server-side) never blocks the form or alarms the customer —
      // the WhatsApp message above is the one guaranteed delivery.
      fetch("/api/catering-inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      }).catch(() => {});
      setSent(true);
      window.scrollTo({ top: e.currentTarget.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
    }
  };

  if (sent) {
    return (
      <div className="card card--ink surface-ink" style={{ color: "var(--cream)", padding: "clamp(28px,5vw,52px)", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 10 }}>🎉</div>
        <h3 className="display" style={{ fontSize: "clamp(1.8rem,5vw,2.8rem)", color: "var(--yellow)" }}>Almost done!</h3>
        <p style={{ fontWeight: 500, margin: "14px auto 0", maxWidth: 420, fontSize: "1.05rem" }}>
          We&apos;ve opened WhatsApp in a new tab with your {form.guests}-guest {form.type.toLowerCase()} details filled in — just hit{" "}
          <strong>send</strong>
          {" "}to reach our team. If it didn&apos;t open, tap the button below.
        </p>
        <div className="flex wrap-gap" style={{ justifyContent: "center", marginTop: 24 }}>
          <Btn onClick={() => window.open(whatsAppUrlFor(form), "_blank", "noopener,noreferrer")} variant="white">
            💬 Open WhatsApp
          </Btn>
          <Btn
            onClick={() => {
              setSent(false);
              setForm(EMPTY);
            }}
            variant="yellow"
          >
            Submit Another
          </Btn>
          <Btn page="eats" variant="green">Browse Menu</Btn>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card" style={{ background: "var(--white)", padding: "clamp(22px,4vw,36px)" }} noValidate>
      <h3 className="display" style={{ fontSize: "1.7rem", marginBottom: 6 }}>Request a Catering Quote</h3>
      <p style={{ fontWeight: 500, opacity: 0.75, marginBottom: 24, fontSize: "0.95rem" }}>Tell us about your event — we reply within 24 hours.</p>
      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 18 }}>
        <Field k="name" label="Full Name" placeholder="Your name" value={form.name} onChange={set("name")} error={errors.name} />
        <Field k="phone" label="Phone" type="tel" placeholder="(416) 000-0000" value={form.phone} onChange={set("phone")} error={errors.phone} />
        <Field k="email" label="Email" type="email" placeholder="you@email.com" value={form.email} onChange={set("email")} error={errors.email} />
        <Field k="date" label="Event Date" type="date" value={form.date} onChange={set("date")} error={errors.date} />
        <Field k="location" label="Event Location" placeholder="Venue / address in the GTA" value={form.location} onChange={set("location")} error={errors.location} />
        <Field k="guests" label="Number of Guests" type="number" placeholder="e.g. 50" value={form.guests} onChange={set("guests")} error={errors.guests} />
        <Field k="type" label="Type of Event" options={EVENT_TYPES} value={form.type} onChange={set("type")} error={errors.type} />
        <Field k="allergies" label="Food Allergies" placeholder="Any allergies or dietary restrictions? (e.g. nuts, dairy)" value={form.allergies} onChange={set("allergies")} error={errors.allergies} />
        <Field k="message" label="Message" type="textarea" placeholder="Stations you want, timing…" full value={form.message} onChange={set("message")} error={errors.message} />
      </div>
      <button type="submit" className="btn btn--green btn--lg btn--block" style={{ marginTop: 22 }}>
        Request Catering Quote →
      </button>
    </form>
  );
}

export default function CateringPage() {
  return (
    <div>
      <PageBanner
        kicker="Catering · GTA-Wide"
        title="Live Puchka & Chaat Catering in the GTA"
        sub="Bring the street-food show to your event. Live stations, bold flavours, unforgettable energy."
        bg="var(--green)"
      />

      {/* occasions */}
      <section className="section-pad" style={{ background: "var(--page-bg)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <SectionHead kicker="Any Occasion" title="We Cater It All" sub="From 20-guest birthdays to 500-guest weddings — across Scarborough, Toronto & the GTA." />
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 14 }}>
            {OCCASIONS.map((o, i) => (
              <Reveal key={o} delay={i * 40}>
                <div className="card" style={{ padding: "22px 18px", background: i % 2 ? "var(--cream)" : "var(--white)", height: "100%" }}>
                  <div style={{ fontSize: 30, marginBottom: 8 }}>{OCCASION_EMOJI[i]}</div>
                  <h3 style={{ fontSize: "1.15rem" }}>{o}</h3>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* stations */}
      <section className="section-pad" style={{ background: "var(--paper)", borderBottom: "var(--border)" }}>
        <div className="wrap">
          <SectionHead kicker="The Experience" title="Live Stations That Steal The Show" />
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {STATIONS.map(([e, t, d, img], i) => (
              <Reveal key={t} delay={i * 60}>
                <div className="card card--lift" style={{ overflow: "hidden", height: "100%" }}>
                  {img ? (
                    <div style={{ position: "relative", width: "100%", aspectRatio: "4 / 3", borderBottom: "var(--border)" }}>
                      <Image src={img} alt={`${t} setup`} fill sizes="(min-width: 880px) 33vw, 90vw" style={{ objectFit: "cover" }} />
                    </div>
                  ) : (
                    <Ph label={`${t} setup`} ratio="4 / 3" style={{ border: "none", borderBottom: "var(--border)", borderRadius: 0 }} />
                  )}
                  <div style={{ padding: 22 }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{e}</div>
                    <h3 style={{ fontSize: "1.35rem", marginBottom: 8 }}>{t}</h3>
                    <p style={{ fontWeight: 500, opacity: 0.82 }}>{d}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* form */}
      <section className="section-pad surface-ink" style={{ background: "var(--ink)" }}>
        <div className="wrap" style={{ maxWidth: 820 }}>
          <div style={{ marginBottom: 28, textAlign: "center", color: "var(--cream)" }}>
            <span className="tape kicker" style={{ background: "var(--yellow)" }}>Get Your Quote</span>
            <h2 className="display" style={{ fontSize: "clamp(1.9rem,5.5vw,3rem)", color: "var(--yellow)", marginTop: 14 }}>Let&apos;s Plan Your Event</h2>
          </div>
          <CateringForm />
        </div>
      </section>
    </div>
  );
}
