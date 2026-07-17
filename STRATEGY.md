# STRATEGY.md — Positioning, competition, and risk posture

Why the roadmap in `PLAN.md` looks the way it does. Structural detail in `ARCHITECTURE.md`.

## The competitive signal

A competitor ("el empresario extranjero" on Instagram, 2026-07) is publicly demoing an AI accountant for Paraguay: monthly IVA declaration prep, comprobante registry, item-by-item deducibility decisions across photographed *and* Marangatú electronic invoices, Formulario 120 submission, and a full PDF report delivered by WhatsApp — "in 4 minutes," with the claim that it "self-corrects, cross-checks everything, and is NEVER wrong."

Read past the marketing and the demo decomposes into five capabilities:

| Capability | Their claim | Our status |
|---|---|---|
| Sales → F.120 casillas (Rubro 1) | shown | data exists (`libroVentas`); casilla mapping = PLAN Phase 1 |
| App-vs-Marangatú reconciliation | shown (their best table) | stronger for us: we're the emitter, discrepancies are first-party data |
| Deducibility per item | "AI decides" | PLAN Phase 2, AI suggests + human decides |
| Ingest Marangatú electronic DEs | shown | PLAN Phase 3, via user-exported XML + official consulta, no credentials |
| F.120 filing + WhatsApp delivery | claimed | transcription-ready draft + honest delivery; no portal automation |

Two things in their demo are actually *ahead* of us today (casilla mapping, DE ingestion) and both are in reach. Everything else is either already ours or a claim we should not imitate.

## Where we win

**1. We emit; they observe.** Their reconciliation compares two views of data they don't control. Our invoices *are* the SIFEN documents — CDC, status, sequence, and rejection codes are first-party. "Registered in app but not emitted" is a query for us, an inference for them. Same for sequence-gap detection: only the emitter can do it.

**2. Verified, not vibes.** Their headline is "never wrong," which is (a) false for any LLM system and (b) a dangerous thing for a client to believe about their own tax filing. Our architecture already embodies the counter-position: AI extracts and suggests; módulo-11 check digits, totals math, and casilla arithmetic are recomputed by tested deterministic code; low confidence renders amber; a named human approves the period close and the PDF says so. **The pitch: "Cada cifra verificada, cada decisión trazable"** — every figure verified, every decision traceable (`AuditLog`, `SifenLog`, `PeriodClose` snapshots). When DNIT questions a number three years later, our user has an answer chain; theirs has a screenshot.

**3. No credential custody.** Filing automation requires storing clients' Marangatú passwords and scraping a government portal. That's a breach-liability and a single portal redesign away from an outage during declaration week. We stay on official rails (SIFEN API through the adapter) and make manual filing trivial instead: a casilla→value table laid out to match the F.120 form, so transcription takes two minutes. If DNIT ever publishes a filing API, our adapter pattern is exactly the seam to add it.

**4. Product depth they don't show.** Real emission with KuDE, contingency handling, cancelation windows, bilingual ES/EN with voseo, CSV/XLSX libros, supplier-category memory, race-safe numbering. The demo is a report; we're the system of record that produces the report.

## What we adopt from them (credit where due)

- **The monthly close as the hero artifact.** Their screenshot is compelling because it's *one document that makes the month legible*. Phase 1 makes that our centerpiece too, including the discrepancy table ("emitir o descartar?" prompts) which is genuinely good UX.
- **Item-level deducibility** as a first-class workflow, not a spreadsheet afterthought.
- **Speed as a feature.** "4 minutes" resonates. Ours should be: close-of-month draft is *already waiting* (cron-prepared) when the user logs in — zero minutes beats four.
- **Delivery to where the client lives** (WhatsApp/email), within honesty limits.

## What we refuse to copy

1. **"Never wrong" claims.** Anti-fabrication is already a house rule (`CLAUDE.md`). Accuracy claims must be verifiable; we publish what is checked deterministically and what remains human judgment.
2. **AI as the deducibility authority.** SET fines the taxpayer, not the model. `PENDING` until a human confirms; memory reduces the burden over time.
3. **Portal credential automation.** See above. This is a durable *no* unless official APIs appear.
4. **Auto-filing.** A draft you approve ≠ a robot that files. The signature line is the product.

## Market posture

- **Wedge:** owner-operators and small estudios contables in Paraguay who already must emit DTEs (SIFEN adoption is mandatory-and-expanding) and dread the monthly F.120 ritual. Emission is the daily hook; the monthly close is the retention moment.
- **Estudio angle (later):** multi-tenant is one lookup away (`getCompanyId()`); an accountant managing N clients gets N ready-to-review drafts on the 1st. The competitor sells to the business owner; the estudio channel scales better per sale.
- **Trust artifacts over ads:** the exportable, human-signed close report is itself the marketing — it's what gets forwarded to (and impresses) the client's accountant.
- **Language:** Paraguayan Spanish with voseo first (already done), English second — matches both local owners and the foreign-entrepreneur segment the competitor is courting.

## Risks

| Risk | Mitigation |
|---|---|
| Competitor ships faster by skipping safeguards | Our safeguards *are* the differentiator; compete on trust + first-party emission data, not feature-count |
| Users demand true auto-filing anyway | Transcription-ready draft narrows the gap to ~2 min; revisit only via official APIs |
| Deducibility rules drift with tax law | Rules are data (`tax/deductibility.ts` table + `tax/calendar.ts`), reviewed per SET resolution changes, versioned in git |
| AI cost/latency on expense volume | Rules-first triage sends only ambiguous items to the model; supplier memory shrinks that set monthly |
| Marangatú XML export format changes | Parser tested on golden files; import is additive (OCR lane unaffected) |

## Sequencing logic

Phase 1 first because it monetizes data we already trust and produces the hero artifact. Phase 2 second because deducibility quality *feeds* Phase 1's IVA crédito accuracy. Phase 3 third because import is additive once reconciliation exists to receive it. Delivery last because a report worth delivering must exist first.
