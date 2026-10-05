import type { CSSProperties } from "react";
import Image from "next/image";
import { Check, Hammer, Heart, MapPin, Sparkle, Users } from "lucide-react";
import { SITE_NAME, SITE_PITCH, SITE_TAGLINE } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";
import { CONTACT, PRICES, QUOTES } from "@/lib/marketing/content";
import { PHOTOS } from "@/lib/marketing/photos";
import {
  Button,
  Eyebrow,
  HeroCollage,
  Notice,
  Pill,
  PriceTable,
  QuoteCard,
  SectionHeading,
  TrustBar,
  stagger,
} from "@/components/marketing/ui";
import { ClassCard } from "@/components/marketing/class-card";
import { loadPublicClasses } from "@/lib/sessions/public";
import { WeekCalendar } from "@/components/marketing/week-calendar";
import { HomeSessions } from "@/components/marketing/home-sessions";

export const metadata = buildMetadata({
  title: `${SITE_NAME} · ${SITE_TAGLINE}`,
  description: SITE_PITCH,
  path: "/",
});

export const dynamic = "force-dynamic";

const pad = (pt: number, pb: number) => ({ "--pt": `${pt}px`, "--pb": `${pb}px` }) as CSSProperties;
const HOME_CLASSES = 6;

export default async function HomePage() {
  const classes = await loadPublicClasses();
  return (
    <>
      <section id="top" className="xl-wrap xl-hero">
        <div className="xl-hero-copy">
          <Eyebrow dot style={stagger(0)}>
            A little space for big discoveries
          </Eyebrow>
          <h1 className="xl-display" style={stagger(1)}>
            Make room
            <br />
            for <span className="xl-highlight">curiosity</span>.
            <Sparkle className="xl-hero-sparkle" size={34} strokeWidth={1.8} aria-hidden />
          </h1>
          <p className="xl-lede" style={stagger(2)}>
            For the makers, the wonderers and the &ldquo;what if?&rdquo; thinkers. Hands-on experiences that grow
            confidence, creativity and connection.
          </p>
          <div className="xl-row" style={stagger(3)}>
            <Button href="/classes" icon="arrow-right">
              Find your next adventure
            </Button>
            <Button href="/#calendar" variant="secondary">
              See this week
            </Button>
          </div>
          <p className="xl-meta" style={stagger(4)}>
            <MapPin size={15} aria-hidden />
            {CONTACT.short}
          </p>
        </div>
        <HeroCollage />
      </section>

      <TrustBar
        items={[
          { icon: Check, label: "Small groups, more discovery" },
          { icon: Heart, label: "Different minds welcome" },
          { icon: Hammer, label: "Real tools. Real experiences." },
        ]}
      />

      <section id="classes" className="xl-wrap xl-section" style={pad(88, 40)}>
        <SectionHeading
          eyebrow="Open for booking"
          title="Find your kind of discovery."
          lede="Our classes with their next dates. Pick one and book a seat for each child."
        />
        {classes.length === 0 ? (
          <p className="xl-body">New classes are on their way. Private sessions run Monday to Saturday by arrangement.</p>
        ) : (
          <div className="xl-grid">
            {classes.slice(0, HOME_CLASSES).map((c) => (
              <ClassCard key={c.publicId} item={c} />
            ))}
          </div>
        )}
        <div className="xl-row" style={{ marginTop: 28 }}>
          <Button href="/classes" icon="arrow-right">
            See all classes
          </Button>
        </div>
        <div style={{ marginTop: 28 }}>
          <Notice icon={Users}>Older siblings are welcome to join too. Please share their ages when booking.</Notice>
        </div>
      </section>

      <section id="calendar" className="xl-wrap xl-section" style={pad(64, 16)}>
        <SectionHeading eyebrow="Your week at Xplorers.Life" title="A little discovery, every week." />
        <WeekCalendar />
      </section>

      <HomeSessions />

      <section id="pricing" className="xl-wrap xl-section" style={pad(72, 24)}>
        <SectionHeading eyebrow="Plan your visit" title="Simple prices. Plenty to discover." />
        <div className="xl-band xl-stack" style={{ marginTop: 28, "--gap": "20px" } as CSSProperties}>
          <div className="xl-stack" style={{ "--gap": "10px" } as CSSProperties}>
            <Eyebrow tone="deep">A little visit or a longer adventure?</Eyebrow>
            <h3 className="xl-panel-title">One simple price. More ways to explore.</h3>
          </div>
          <PriceTable caption={PRICES.caption} columns={PRICES.columns} rows={PRICES.rows} />
        </div>
      </section>

      <section id="space" className="xl-wrap xl-section" style={pad(64, 24)}>
        <div className="xl-feature">
          <div className="xl-feature-copy">
            <Eyebrow tone="ink">More than a workshop</Eyebrow>
            <h2 className="xl-h2">
              A space to explore.
              <br />A place to <span className="xl-emph-deep">belong.</span>
            </h2>
            <p className="xl-body">
              We&rsquo;re a small hands-on learning and maker space where curiosity leads the way. We welcome
              neurodivergent learners, including children with ASD and ADHD.
            </p>
            <Pill variant="sunshine">Explore · Create · Grow · Belong</Pill>
          </div>
          <div className="xl-feature-media">
            <Image
              src={PHOTOS.kids}
              alt="Children mixing colourful experiments at a Sunday Social"
              fill
              sizes="(min-width: 900px) 50vw, 100vw"
            />
          </div>
        </div>
      </section>

      <section className="xl-wrap xl-section" style={pad(56, 24)}>
        <SectionHeading eyebrow="In their words" title="What our young explorers say." size="md" />
        <div className="xl-grid-quotes" style={{ marginTop: 24 }}>
          {QUOTES.map((q) => (
            <QuoteCard key={q.who} {...q} />
          ))}
        </div>
      </section>

    </>
  );
}
