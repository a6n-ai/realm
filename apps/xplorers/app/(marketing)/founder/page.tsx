import Image from "next/image";
import { SITE_NAME } from "@/lib/brand";
import { buildMetadata } from "@/lib/seo";
import { FOUNDER } from "@/lib/marketing/content";
import { Button, Eyebrow, stagger } from "@/components/marketing/ui";

export const metadata = buildMetadata({
  title: `Meet ${FOUNDER.name} · ${SITE_NAME}`,
  description: `Meet ${FOUNDER.name} (${FOUNDER.short}), founder of ${SITE_NAME} and ${FOUNDER.role.toLowerCase()}.`,
  path: "/founder",
});

export default function FounderPage() {
  return (
    <article>
      <section className="xl-wrap xl-section xl-about-hero">
        <div className="xl-founder">
          <div className="xl-founder-photo">
            <Image src={FOUNDER.photo} alt={`${FOUNDER.name}, founder of ${SITE_NAME}`} fill priority sizes="(min-width: 900px) 40vw, 100vw" />
          </div>
          <div className="xl-founder-copy">
            <Eyebrow dot style={stagger(0)}>
              Meet the educator
            </Eyebrow>
            <h1 className="xl-display xl-about-title" style={stagger(1)}>
              Hi, I&rsquo;m {FOUNDER.name} <span className="xl-founder-aka">({FOUNDER.short})</span>
            </h1>
            <p className="xl-founder-role" style={stagger(2)}>
              Founder of {SITE_NAME} · {FOUNDER.role}
            </p>
            <h2 className="xl-about-h2">Welcome to {SITE_NAME}!</h2>
            <p className="xl-body xl-justify">{FOUNDER.story[0]}</p>
          </div>
        </div>
      </section>

      <section className="xl-wrap xl-section xl-about-section">
        <h2 className="xl-about-h2">From coaching to child-centred learning.</h2>
        <div className="xl-about-columns">
          <p className="xl-body xl-justify">{FOUNDER.story[1]}</p>
          {FOUNDER.calling.map((p) => (
            <p key={p} className="xl-body xl-justify">
              {p}
            </p>
          ))}
        </div>
      </section>

      <section className="xl-wrap xl-section xl-about-section">
        <h2 className="xl-about-h2">Connection first. Growth follows.</h2>
        <div className="xl-about-columns">
          {FOUNDER.connection.map((p) => (
            <p key={p} className="xl-body xl-justify">
              {p}
            </p>
          ))}
        </div>
        <ul className="xl-founder-approach">
          {FOUNDER.approach.map((a) => (
            <li key={a.title}>
              <b>{a.title}</b>
              <span>{a.body}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="xl-wrap xl-section xl-about-section">
        <h2 className="xl-about-h2">Connect, explore, belong, create, grow.</h2>
        <ol className="xl-growth">
          {FOUNDER.growth.map((g) => (
            <li key={g.word}>
              <Image src={g.src} alt={g.alt} width={96} height={96} />
              <span>{g.word}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="xl-wrap xl-section xl-about-section xl-about-close">
        <p className="xl-founder-motto">
          Your child doesn&rsquo;t have to fit into a class. We create an experience that fits your child.
        </p>
        <div className="xl-row">
          <Button href="/classes" icon="arrow-right">
            See classes
          </Button>
          <Button href="/contact" variant="secondary">
            Talk to {FOUNDER.short}
          </Button>
        </div>
      </section>
    </article>
  );
}
