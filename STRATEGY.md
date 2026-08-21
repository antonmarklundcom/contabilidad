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
| Ingest Marangatú electronic DEs | shown | shipped as CSV/XLSX comprobante-export import (PLAN Phase 3, no credentials); XML DEs + official consulta still open (Phase 5.8) |
| F.120 filing + WhatsApp delivery | claimed | transcription-ready draft + honest delivery; no portal automation |

Two things in their demo are actually *ahead* of us today (casilla mapping, DE ingestion) and both are in reach. Everything else is either already ours or a claim we should not imitate.

## The second competitor: the service firm

RucAndAccounting.com sells compliance-as-a-service to foreigners who already hold Paraguayan residency: RUC registration, monthly IVA + yearly IRP filings, proof of address for KYC, tax residency certificate, mail reception, receipts over WhatsApp. Different animal from competitor A — humans do the work, the portal is the shop window.

**They are not competing with us on software.** Their portal shows filings, deadlines and scanned documents; it does not emit DTEs, does not reconcile, does not do item-level deducibility. Where they beat us is *legibility for a non-accountant client*: a countdown to the next deadline, a list of filings with the official PDF attached, and a folder of documents. Those are cheap for us and are now PLAN Phases 5–6.

Where they beat us structurally is **IRP** (PLAN Phase 7) — a residency client's whole reason to hold a RUC is the annual return plus the certificate it enables, and we currently only handle IVA.

Where we should *not* follow: the service lines themselves. Renting addresses, receiving mail, and shipping apostilled certificates is an operations business with headcount, licensing and liability that has nothing to do with a software margin. If we ever want that revenue, the correct move is a referral relationship with a firm like theirs, not building an ops department — and our software is a better portal than theirs on the day we ship Phases 5–6.

Their real lesson is positioning: they sell an *outcome* ("your RUC stays in good standing") to a segment that doesn't want to learn accounting. We sell a system of record. The deadline card and the filing archive are what translate our system of record into their outcome language, for free.

## Where we win

**1. We emit; they observe.** Their reconciliation compares two views of data they don't control. Our invoices *are* the SIFEN documents — CDC, status, sequence, and rejection codes are first-party. "Registered in app but not emitted" is a query for us, an inference for them. Same for sequence-gap detection: only the emitter can do it, and it shipped in PLAN Phase 5.9 — `/taxes` lists both a number missing inside the period and a number the sequence reserved that no document ever claimed.

**2. Verified, not vibes.** Their headline is "never wrong," which is (a) false for any LLM system and (b) a dangerous thing for a client to believe about their own tax filing. Our architecture already embodies the counter-position: AI extracts and suggests; módulo-11 check digits, totals math, and casilla arithmetic are recomputed by tested deterministic code; low confidence renders amber; a named human approves the period close and the PDF says so. **The pitch: "Cada cifra verificada, cada decisión trazable"** — every figure verified, every decision traceable (`AuditLog`, `SifenLog`, immutable `TaxFiling` snapshots). When DNIT questions a number three years later, our user has an answer chain; theirs has a screenshot. Snapshot immutability is enforced in the database layer as of PLAN Phase 5.10 (a `SUBMITTED`/`PAID` filing cannot be reopened or re-closed), so the pitch is load-bearing.

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
| Deducibility rules drift with tax law | The calendar is data (`src/lib/tax/calendar.ts`), reviewed per SET resolution changes, versioned in git. ⚠️ The deducibility *rules table* was never built — today AI suggests a percentage per item at OCR time and a human confirms; if rules drift becomes real, build the table (PLAN Phase 2 note) |
| AI cost/latency on expense volume | Deducibility suggestion piggybacks the OCR call (no extra request); the rules-first triage + supplier memory described in Phase 2 remain unbuilt fallbacks if volume demands them |
| Marangatú export format changes | Parser does accent/case-insensitive header matching over the CSV/XLSX export; golden-file fixtures pin the shapes the export has been seen in (`tests/fixtures/marangatu/`); import is additive (OCR lane unaffected) |
| Calendar table unverified vs. primary DNIT source | Now load-bearing (`TaxFiling.dueDate`, deadline card) — owner must verify `PERPETUAL_CALENDAR` against the DNIT resolution before the first production filing (PLAN Phase 5.1) |

## Sequencing logic

Phase 1 first because it monetizes data we already trust and produces the hero artifact. Phase 2 second because deducibility quality *feeds* Phase 1's IVA crédito accuracy. Phase 3 third because import is additive once reconciliation exists to receive it. Delivery last because a report worth delivering must exist first.
