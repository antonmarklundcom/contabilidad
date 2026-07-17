# PLAN.md — Feature roadmap

What we build next, in order, and why. Companion docs: `ARCHITECTURE.md` (how it fits the codebase), `STRATEGY.md` (why these choices vs. the competition).

## Context

A competitor is publicly demoing an AI accountant for Paraguay that: classifies sales into Formulario 120 casillas (Rubro 1), registers comprobantes, decides deducibility item-by-item across photographed and electronic invoices, reconciles app records against Marangatú, prepares/"sends" the F.120, and delivers a full PDF report via WhatsApp — claiming it "never makes mistakes."

We already have the foundation they'd need: real SIFEN emission (mock + real adapters), OCR expense capture with **local** validation, libro de ventas/compras, IVA débito/crédito position, KuDE PDFs, a job queue, and audit logging. The plan below closes the visible feature gap and beats them on trustworthiness.

## Phase 1 — Monthly IVA close & Formulario 120 draft (highest value, lowest risk)

The centerpiece of the competitor's demo is really a *report*: period sales/purchases classified into F.120 casillas, plus a discrepancy list. We can produce that from data we already trust.

1. **`src/lib/tax/f120.ts`** — pure functions that map a period's approved invoices (`libroVentas`) and confirmed expenses (`libroCompras`) into F.120 rubros/casillas: gravadas 10%, gravadas 5%, exentas, IVA débito, IVA crédito, saldo a favor / a pagar. Deterministic math only — same philosophy as `money.ts`. Unit tests against hand-computed fixtures.
2. **Reconciliation checks** (`src/lib/tax/reconcile.ts`): the competitor's most impressive screenshot is the "registered in app but NOT emitted in Marangatú" table. We can do this natively because we *are* the emitter:
   - invoices in the app not yet APPROVED by SIFEN (draft/queued/contingency/rejected) for the period;
   - sequence gaps in `DocumentSequence` ranges;
   - expenses with failed local validation (RUC check digit, totals math) still unresolved;
   - duplicate-suspect expenses.
3. **`/reports/declaracion` route** — period picker, casilla summary, discrepancy tables, per-number drill-down. Server Component + existing list-controls conventions.
4. **Monthly close PDF** (`src/lib/tax/report-pdf.ts`, reusing the `kude.ts` pdfkit setup): the full report — casillas, libro summaries, discrepancies, "reviewed by" line. Stored under `STORAGE_DIR/exports`, never deleted (tax doc policy).
5. **Explicit human sign-off**: a "Cerrar período" action records who approved the close (`audit()`), locks the period's numbers into a snapshot table. The PDF footer states the figures were human-approved — the direct counter to "no se equivoca NUNCA."

**Not in scope:** auto-submitting the F.120 to Marangatú. There is no public filing API; automating it means storing the client's SET login and screen-scraping a government portal. We produce a *transcription-ready* draft (casilla → value table matching the form layout) instead. See STRATEGY.md §Risk.

## Phase 2 — Deducibility engine (AI-suggested, human-decided)

Item-by-item deducibility is genuinely useful and a real pain point. Competitor claims AI decides; we make AI *suggest* and a human confirm — same pattern as our OCR review screen.

1. Schema: add `deductibility` (`FULL | PARTIAL | NONE | PENDING`), `deductibilityConfidence`, `deductibilityReason` to `Expense` (and later per-line if we itemize expenses).
2. **Rules first, AI second** (`src/lib/tax/deductibility.ts`):
   - deterministic rules for the clear cases (category-based: fuel limits, personal-consumption categories, missing/invalid RUC ⇒ not deductible, etc.), maintained as data not prompts;
   - Anthropic call (same stack as `ocr.ts`: `messages.parse()` + zod + per-field confidence) only for the ambiguous remainder;
   - everything below a confidence threshold renders amber and stays `PENDING` until a human decides. Decisions feed `SupplierCategoryMap`-style memory so repeat suppliers stop needing review.
3. Review UI on the expense detail + a "pending deducibility" queue filter on the expenses list.
4. Deducibility feeds Phase 1's IVA crédito figures — only confirmed-deductible IVA counts.

## Phase 3 — External comprobante import & reconciliation

The competitor ingests "electrónicas y virtuales que están en Marangatú." We do the same without credentials:

1. **XML DE upload**: accept e-Kuatia XML files the user downloads themselves (Marangatú lets taxpayers export their received DEs). Parse with the same field vocabulary as `sifen/mapping.ts`; validate CDC with our local `cdc.ts`; create/match expenses. Batch upload.
2. **CDC lookup**: a "paste CDC" flow that runs `queryStatus`/consulta through the existing SIFEN adapter to verify a received document is real and APPROVED before trusting it — a check the competitor doesn't show.
3. Reconcile imported DEs against OCR-captured expenses (match on RUC + número + fecha + total, the existing duplicate-detection key) so a photographed invoice and its electronic twin merge instead of double-counting.

## Phase 4 — Delivery & polish

1. **Email delivery** of the monthly close PDF via existing `mailer.ts`, enqueued as a `send_report` job after period close.
2. **WhatsApp**: keep the current honest share flow (open WhatsApp with message, user attaches PDF). True auto-send requires the WhatsApp Business API — evaluate cost/approval then; do not fake it.
3. **Scheduled close reminder**: cron job that, a few days before the F.120 due date (per SET's perpetual calendar by RUC last digit), emails/notifies "your draft declaration is ready to review."
4. Multi-tenant activation (the `companyId` groundwork already exists) once a second client wants in.

## Sequencing & effort

| Phase | Depends on | Rough size |
|---|---|---|
| 1 — F.120 draft + close report | nothing new | core math + 1 route + 1 PDF |
| 2 — Deducibility | Phase 1 UI shell | schema migration + rules + review UI |
| 3 — DE import | mapping vocabulary (exists) | parser + matcher + upload route |
| 4 — Delivery | Phases 1–3 | small, mostly wiring |

Tests to keep green throughout: existing money/RUC/CDC/sequence suites, plus new fixtures for f120 math and deductibility rules — these are money-path and get the same "protect the money" treatment as `tests/`.
