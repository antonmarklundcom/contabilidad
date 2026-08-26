import Link from "next/link";
import { contactable, whatsappUrl } from "@/lib/marketing";

/** The page's horizontal rhythm, in one place. */
export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function Section({
  children,
  tone = "paper",
  className = "",
  id,
}: {
  children: React.ReactNode;
  tone?: "paper" | "surface" | "wash" | "deep";
  className?: string;
  id?: string;
}) {
  const backgrounds: Record<string, string> = {
    paper: "bg-[var(--m-paper)]",
    surface: "bg-[var(--m-surface)]",
    wash: "bg-[var(--m-accent-wash)]",
    deep: "bg-[var(--m-deep)] text-white",
  };
  return (
    <section
      id={id}
      className={`${backgrounds[tone]} py-16 sm:py-24 ${className}`}
    >
      <Container>{children}</Container>
    </section>
  );
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="m-eyebrow mb-3">{children}</p>;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  lead?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      className={`${align === "center" ? "mx-auto text-center" : ""} max-w-2xl`}
    >
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="m-h2">{title}</h2>
      {lead ? <p className="m-lead mt-4">{lead}</p> : null}
    </div>
  );
}

/**
 * The primary call to action.
 *
 * WhatsApp is how business is actually done here, so it leads — but only when
 * there is a real number. Until `firm.ts` has one, the button points at the
 * contact page instead of at a fabricated link.
 */
export function PrimaryCta({
  message,
  label = "Escribinos por WhatsApp",
  fallbackLabel = "Contactanos",
}: {
  message?: string;
  label?: string;
  fallbackLabel?: string;
}) {
  const wa = whatsappUrl(message);
  if (!wa) {
    return (
      <Link href="/contacto" className="m-btn m-btn-primary">
        {fallbackLabel}
      </Link>
    );
  }
  return (
    <a href={wa} className="m-btn m-btn-primary" rel="noopener">
      {label}
    </a>
  );
}

export function SecondaryCta({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="m-btn m-btn-ghost">
      {children}
    </Link>
  );
}

export function CtaRow({ message }: { message?: string }) {
  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <PrimaryCta message={message} />
      <SecondaryCta href="/servicios">Ver los servicios</SecondaryCta>
    </div>
  );
}

/** Closing call to action, repeated once per page and never more. */
export function ClosingCta({
  title = "Conversemos sobre tu caso",
  lead = "Una primera conversación no cuesta nada y suele aclarar bastante. Contanos qué obligaciones tenés hoy y qué te está costando más tiempo.",
  message,
}: {
  title?: string;
  lead?: string;
  message?: string;
}) {
  return (
    <Section tone="deep">
      <div className="max-w-2xl">
        <h2 className="m-h2">{title}</h2>
        <p className="m-lead mt-4 text-white/75">{lead}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <PrimaryCta message={message} />
          <Link
            href="/contacto"
            className="m-btn border-white/25 bg-transparent text-white hover:border-white/60"
          >
            Ver todas las formas de contacto
          </Link>
        </div>
        {!contactable() ? (
          // Visible on purpose while firm.ts is unfilled: better an obvious
          // gap than an invented phone number.
          <p className="mt-6 text-sm text-white/50">
            TODO(owner): cargar los datos de contacto en{" "}
            <code>src/lib/marketing/firm.ts</code>.
          </p>
        ) : null}
      </div>
    </Section>
  );
}

export function TickList({
  items,
  className = "",
}: {
  items: readonly string[];
  className?: string;
}) {
  return (
    <ul className={`m-ticks space-y-2.5 text-[var(--m-ink-soft)] ${className}`}>
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Numbered steps — the one place the site uses big type as an ornament. */
export function Steps({
  steps,
}: {
  steps: readonly { title: string; detail: string }[];
}) {
  return (
    <ol className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--m-line)] bg-[var(--m-line)] sm:grid-cols-2">
      {steps.map((step, index) => (
        <li key={step.title} className="bg-[var(--m-surface)] p-6 sm:p-8">
          <span className="font-mono text-3xl font-semibold text-[var(--m-accent)] tabular-nums">
            {String(index + 1).padStart(2, "0")}
          </span>
          <h3 className="m-h3 mt-3">{step.title}</h3>
          <p className="mt-2 text-[var(--m-ink-soft)]">{step.detail}</p>
        </li>
      ))}
    </ol>
  );
}

/** FAQ as native disclosure elements: no JavaScript, and Ctrl+F still works. */
export function Faqs({
  faqs,
}: {
  faqs: readonly { question: string; answer: string }[];
}) {
  return (
    <div className="mt-8 divide-y divide-[var(--m-line)] border-y border-[var(--m-line)]">
      {faqs.map((faq) => (
        <details key={faq.question} className="group py-5">
          <summary className="flex cursor-pointer list-none items-start justify-between gap-6 font-medium">
            {faq.question}
            <span
              aria-hidden
              className="mt-1 shrink-0 text-[var(--m-accent)] transition-transform group-open:rotate-45"
            >
              +
            </span>
          </summary>
          <p className="mt-3 max-w-2xl text-[var(--m-ink-soft)]">
            {faq.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
