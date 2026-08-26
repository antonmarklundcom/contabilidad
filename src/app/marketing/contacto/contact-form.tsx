"use client";

import { useState } from "react";
import { submitLeadAction } from "./actions";

/**
 * The only interactive component on the marketing site.
 *
 * Kept to a single small client component so the rest of the site ships no
 * JavaScript. It posts a `FormData` to the server action; validation is
 * server-side (`lead.ts`), and the browser's own `required` attributes are
 * convenience, never the check.
 */
export function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  if (state === "sent") {
    return (
      <div className="m-card p-7">
        <h2 className="m-h3">Mensaje enviado</h2>
        <p className="mt-2 text-[var(--m-ink-soft)]">
          Gracias por escribirnos. Te respondemos a la brevedad, en horario
          laboral.
        </p>
      </div>
    );
  }

  return (
    <form
      className="m-card space-y-4 p-7"
      onSubmit={async (event) => {
        event.preventDefault();
        setError(null);
        setState("sending");
        const result = await submitLeadAction(
          new FormData(event.currentTarget),
        );
        if (result.ok) {
          setState("sent");
          return;
        }
        setError(result.error);
        setState("idle");
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" name="name" required autoComplete="name" />
        <Field label="Empresa" name="company" autoComplete="organization" />
        <Field label="Correo" name="email" type="email" autoComplete="email" />
        <Field
          label="Teléfono / WhatsApp"
          name="phone"
          type="tel"
          autoComplete="tel"
        />
      </div>
      <Field label="Asunto" name="subject" />
      <label className="block">
        <span className="text-sm font-medium">Mensaje</span>
        <textarea
          name="message"
          required
          rows={6}
          minLength={10}
          maxLength={4000}
          placeholder="Contanos qué obligaciones tenés hoy y qué necesitás resolver."
          className="mt-1.5 w-full rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] px-3 py-2.5 text-[var(--m-ink)] placeholder:text-[var(--m-muted)]"
        />
      </label>

      {/* Honeypot: hidden from people, irresistible to bots. */}
      <div aria-hidden className="hidden">
        <label>
          No completar
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <p className="text-sm text-[var(--m-muted)]">
        Usamos tus datos únicamente para responderte esta consulta.
      </p>

      {error ? (
        <p role="alert" className="text-sm text-[var(--m-accent-ink)]">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={state === "sending"}
        className="m-btn m-btn-primary w-full"
      >
        {state === "sending" ? "Enviando…" : "Enviar consulta"}
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">
        {label}
        {required ? null : (
          <span className="text-[var(--m-muted)]"> (opcional)</span>
        )}
      </span>
      <input
        type={type}
        name={name}
        required={required}
        autoComplete={autoComplete}
        className="mt-1.5 w-full rounded-lg border border-[var(--m-line)] bg-[var(--m-surface)] px-3 py-2.5 text-[var(--m-ink)]"
      />
    </label>
  );
}
