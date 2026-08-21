# PLAN.md — Feature roadmap

What we build next, in order, and why. Companion docs: `ARCHITECTURE.md` (how it fits the codebase), `STRATEGY.md` (why these choices vs. the competition).

## Status at a glance

| Phase | Scope | Status |
|---|---|---|
| 1 | F.120 draft, reconciliation, `/taxes`, close + sign-off | **Shipped** (`form120.ts`, `reconcile.ts`, `tax-report.ts`) |
| 2 | Item-level deducibility | **Shipped** (`deductibility.ts`, `ExpenseItem`) |
| 3 | Marangatú/e-Kuatia import & matching | **Shipped** (`marangatu-import.ts`, `/api/expenses/import`) |
| 4 | Delivery & polish | Partial — `mailer.ts` exists, no report/reminder jobs |
| 5 | Compliance calendar & filing archive | **Mostly shipped** — 5.1–5.5 done (PRs #7 #8 #9); 5.6–5.8 (reminder/expiry jobs, `send_report`, paste-a-CDC) still open |
| 6 | Document vault & client portal roles | Planned |
| 7 | Annual IRP return | Planned |
| 8 | Intake channels (WhatsApp, one-time invoice link) | Planned, gated |
| 9 | Public site: `contador.com.py` marketing + `sistema.contador.com.py` app split | Planned, next |

## Context — competitor A: the AI accountant

A competitor is publicly demoing an AI accountant for Paraguay that: classifies sales into Formulario 120 casillas (Rubro 1), registers comprobantes, decides deducibility item-by-item across photographed and electronic invoices, reconciles app records against Marangatú, prepares/"sends" the F.120, and delivers a full PDF report via WhatsApp — claiming it "never makes mistakes."

We already have the foundation they'd need: real SIFEN emission (mock + real adapters), OCR expense capture with **local** validation, libro de ventas/compras, IVA débito/crédito position, KuDE PDFs, a job queue, and audit logging. The plan below closes the visible feature gap and beats them on trustworthiness.

## Context — competitor B: the service firm (RucAndAccounting.com)

A second, different competitor: a done-for-you compliance firm selling to foreigners who already hold Paraguayan residency. Their offer is RUC registration/activation in Marangatú, monthly IVA + yearly IRP filings, proof of address for KYC (registered address, utility bills, rental contract), tax residency certificate, mail reception and scanning, and receipt capture over WhatsApp — all surfaced in a client portal.

Most of that is **operations, not software**: registering RUCs, renting an address, receiving physical mail, shipping apostilled certificates. Those are a business decision, not a backlog item, and are deliberately out of scope here. What *is* in scope is the portal around them, because it is what their prospects actually see, and four of its screens are things we don't have:

| Their portal feature | Our status | Lands in |
|---|---|---|
| "Next IVA filing deadline — 24 days remaining" | no tax calendar at all | Phase 5 |
| "All Filings", box by box, status + official PDF | `PeriodClose` is a JSON blob in `Setting` | Phase 5 |
| Mailbox / document vault (bank statements, DNIT notices, contracts) | `storage.ts` only; no model, no UI | Phase 6 |
| Yearly income tax return (IRP) | nothing — we only do IVA | Phase 7 |
| Receipt by WhatsApp, invoice from a one-time link | OCR exists but login-walled | Phase 8 |
| Client-facing portal login | `User.role` exists but is never enforced | Phase 6 |

Their timbrado/renewal handholding also implies expiry alerting, which we can do from data we already store (`Company.timbradoFechaInicio`, cert expiry) — folded into Phase 5.

## Phase 1 — Monthly IVA close & Formulario 120 draft ✅ shipped

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

Shipped as `src/lib/form120.ts` + `src/lib/reconcile.ts` + `src/lib/tax-report.ts` + the `/taxes` route (period picker, casilla summary, discrepancy tables, "Cerrar período" with `closedBy`/`closedAt`). Note the file layout differs from the sketch below: these live directly in `src/lib/`, not `src/lib/tax/`. New tax modules follow the shipped layout.

## Phase 2 — Deducibility engine (AI-suggested, human-decided) ✅ shipped

Item-by-item deducibility is genuinely useful and a real pain point. Competitor claims AI decides; we make AI *suggest* and a human confirm — same pattern as our OCR review screen.

1. Schema: add `deductibility` (`FULL | PARTIAL | NONE | PENDING`), `deductibilityConfidence`, `deductibilityReason` to `Expense` (and later per-line if we itemize expenses).
2. **Rules first, AI second** (`src/lib/tax/deductibility.ts`):
   - deterministic rules for the clear cases (category-based: fuel limits, personal-consumption categories, missing/invalid RUC ⇒ not deductible, etc.), maintained as data not prompts;
   - Anthropic call (same stack as `ocr.ts`: `messages.parse()` + zod + per-field confidence) only for the ambiguous remainder;
   - everything below a confidence threshold renders amber and stays `PENDING` until a human decides. Decisions feed `SupplierCategoryMap`-style memory so repeat suppliers stop needing review.
3. Review UI on the expense detail + a "pending deducibility" queue filter on the expenses list.
4. Deducibility feeds Phase 1's IVA crédito figures — only confirmed-deductible IVA counts.

Shipped as `src/lib/deductibility.ts` + the `ExpenseItem` model (per-line `deduciblePercent`, with an expense-level fallback when there are no items).

## Phase 3 — External comprobante import & reconciliation ✅ shipped

The competitor ingests "electrónicas y virtuales que están en Marangatú." We do the same without credentials:

1. **XML DE upload**: accept e-Kuatia XML files the user downloads themselves (Marangatú lets taxpayers export their received DEs). Parse with the same field vocabulary as `sifen/mapping.ts`; validate CDC with our local `cdc.ts`; create/match expenses. Batch upload.
2. **CDC lookup**: a "paste CDC" flow that runs `queryStatus`/consulta through the existing SIFEN adapter to verify a received document is real and APPROVED before trusting it — a check the competitor doesn't show.
3. Reconcile imported DEs against OCR-captured expenses (match on RUC + número + fecha + total, the existing duplicate-detection key) so a photographed invoice and its electronic twin merge instead of double-counting.

Shipped as `src/lib/marangatu-import.ts` + `/api/expenses/import`. Item 2 (paste-a-CDC consulta) is **not** done — it rolls forward into Phase 5.

## Phase 4 — Delivery & polish (partial)

1. **Email delivery** of the monthly close PDF via existing `mailer.ts`, enqueued as a `send_report` job after period close.
2. **WhatsApp**: keep the current honest share flow (open WhatsApp with message, user attaches PDF). True auto-send requires the WhatsApp Business API — evaluate cost/approval then; do not fake it.
3. **Scheduled close reminder**: cron job that, a few days before the F.120 due date (per SET's perpetual calendar by RUC last digit), emails/notifies "your draft declaration is ready to review."
4. Multi-tenant activation (the `companyId` groundwork already exists) once a second client wants in.

None of the four are done. Items 1 and 3 are absorbed into Phase 5, which gives them the calendar they were missing.

## Phase 5 — Compliance calendar & filing archive (next)

Competitor B's two strongest portal screens — "next deadline, N days remaining" and "all filings, box by box, with the official PDF." Both are cheap for us because the numbers already exist; what's missing is a due date and a durable record.

1. **`src/lib/tax/calendar.ts`** — ✅ **shipped**. SET's perpetual calendar: due date for a period keyed by the **last digit of the RUC**. Pure functions (`ivaDueDate`, `irpDueDate`, `daysUntil`, plus `nextIvaFiling`), table-as-data (`PERPETUAL_CALENDAR`) so a resolution change is a one-line edit. Weekend/holiday roll-forward with Easter-derived and fixed national holidays; decree-declared asuetos are a caller-supplied option because they are not perpetual. Fixtures per digit in `tests/tax-calendar.test.ts`. ⚠️ The digit→day table is corroborated across four sources but **not** verified against a primary DNIT document — the build environment blocks `dnit.gov.py`. Needs owner sign-off.
2. **`TaxFiling` model** — ✅ **shipped**. Replaces the `PeriodClose` JSON blob previously stashed in `Setting`. Fields: `companyId, type (IVA|IRP), year, month?, status (DRAFT|CLOSED|SUBMITTED|PAID), dueDate, snapshot Json, closedBy, closedAt, submittedAt, paidAt, officialPdfPath, notes`. `closePeriod()`/`getPeriodClose()`/`reopenPeriod()` live in `src/lib/tax/filing.ts` and are re-exported from `form120.ts`, so callers were untouched. Snapshot is immutable — reopening deletes the filing rather than editing it. The `20260804094717_tax_filing` migration **copies** the old `Setting` rows across and leaves them in place; the copy is idempotent (`ON CONFLICT DO NOTHING`) and proven by `tests/tax-filing-migration.test.ts`, which executes the shipped SQL itself. Known gap: Postgres treats NULLs as distinct, so the unique constraint does not dedupe annual (`month IS NULL`) filings — Phase 7 must address that before writing IRP rows.
3. **Filing status transitions** — ✅ **shipped**. Mark submitted / mark paid server actions (zod-validated, `audit()`ed, company-scoped), plus an upload slot for the DNIT receipt PDF in a new `STORAGE_DIR/filings` bucket. Replacing a receipt writes a new file and repoints the filing; the previous one stays on disk.
4. **`/taxes/historial`** — ✅ **shipped**. Filing list using the standard `list-controls` conventions (search, date range, status, pagination, CSV via `/api/export/filings`), each row drilling into `/taxes/historial/[id]`: the frozen snapshot's casilla table, the lifecycle timeline, the receipt PDF and a notes field.
5. **Deadline card** — ✅ **shipped**. `src/components/deadline-card.tsx` on both the dashboard and `/taxes`: next filing, due date, days remaining, current status. An unsubmitted filing already past its due date outranks the upcoming one, since that is the more urgent thing to show. Renders nothing when the RUC cannot be parsed rather than showing a date we cannot stand behind.
6. **Reminder + expiry jobs** — ⏳ **not started**. New `filing_reminder` job type in `jobs/handlers.ts`, enqueued from `/api/cron` when `calendar.ts` says a filing is due in N days (default 10/3/1) and the period isn't `SUBMITTED`. Same job covers **timbrado expiry** (`Company.timbradoFechaInicio`/fin) and **certificate expiry** (already read by `crypto.ts` via node-forge) at 60/30/7 days. Email through `mailer.ts`; no-op cleanly when SMTP is unconfigured.
7. **Phase 4 items 1 & 3 land here**: ⏳ **not started**. `send_report` job emailing the monthly close PDF after `closePeriod()`.

**Groundwork notes for 5.6/5.7** (from a scoping pass, not yet built):
- `Company` has `timbradoFechaInicio` but **no `timbradoFechaFin`** — timbrado expiry alerting needs that column added (nullable) plus a migration.
- Certificate expiry needs no new field: `Company.certExpiresAt` is already populated.
- Deduplication ("never send the same reminder twice") wants a `NotificationLog` model keyed unique on `(companyId, kind, subject, threshold)`, where the sender inserts first and treats a unique violation as "already sent" — atomic, matching how the job runner claims jobs with `updateMany`.
- `mailer.ts` already exposes `smtpConfigured()`; the jobs must no-op cleanly when it returns false.
8. **Paste-a-CDC consulta** (carried from Phase 3.2) — verify a received document through the SIFEN adapter before trusting it.

## Phase 6 — Document vault & client portal roles

Their "Mailbox" screen, minus the physical mail operation. This is what makes the app usable *by the client* rather than only by the bookkeeper.

1. **`Document` model** — `companyId, kind (BANK_STATEMENT|DNIT_NOTICE|CONTRACT|CERTIFICATE|FILING|OTHER), title, filePath, mimeType, sizeBytes, receivedAt, uploadedBy, notes`. Files go under a new `STORAGE_DIR/documents` bucket, read-confined like every other bucket.
2. **`/documents` route** — upload, list (standard list-controls), download, tag by kind. Filing PDFs from Phase 5 appear here automatically rather than being a second silo.
3. **Role enforcement** — `User.role` (`admin` | `accountant` | `client`) is currently declared and never checked. Enforce in `middleware.ts` *and* in each server action (never trust the route alone): `client` = read own company, upload documents/receipts, no emission, no settings, no period close. Add tests for the deny paths.
4. **Multi-tenant activation** (carried from Phase 4.4) — scope `getCompanyId()` to the session. The estudio channel in STRATEGY depends on 3 + 4 together.

## Phase 7 — Annual income tax return (IRP)

The one genuine functional gap: we do IVA only, they file IRP too, and IRP is the reason a residency client keeps a RUC at all.

1. **`src/lib/tax/irp.ts`** — annual aggregation of income and deductible expense categories into the IRP form's rubros, built on the same `libroVentas`/`libroCompras` primitives and the Phase 2 deducibility percentages. Deterministic; fixtures per bracket.
2. **`/taxes/anual`** — mirrors `/taxes`: year picker, rubro table, discrepancy list, close + sign-off, PDF via `tax-report.ts`.
3. Reuses Phase 5's `TaxFiling` (`type = IRP`) and calendar for the annual due date — no parallel machinery.
4. **Scope check before building:** IRP rules vary by taxpayer regime (IRP-RSP vs. IRP-RGC). Confirm which regime our wedge users are in and build that one first; the other stays a stub.

## Phase 8 — Intake channels (gated)

Lowering the friction of getting a receipt into the books. Both are real product, both have a gate.

1. **One-time invoice link** — signed, short-lived token route (`/e/[token]`) rendering a minimal emission form that calls `emitInvoice()`. No login, no install. Token is single-use, scoped to one company and one document type, `audit()`ed on redemption. Small and genuinely differentiating; build first.
2. **WhatsApp receipt intake** — WhatsApp Business API webhook → media download → the existing `/api/expenses/upload` OCR pipeline → normal amber-confidence review. **Gate:** requires a Meta Business account, a verified number and per-conversation costs. Evaluate before committing. Until then the honest share flow (Phase 4.2) stands — do not simulate an inbound channel we don't have.

## Phase 9 — Public site: `contador.com.py` marketing + `sistema.contador.com.py` app split

The owner holds `contador.com.py` (currently static HTML on a different Hostinger account) and wants it to read as a normal Paraguayan accounting *firm* — SEO-optimized, no SaaS/product framing — with the actual software living behind a subdomain. Same shape already proven on `clientes.com.py` / `crm.clientes.com.py`: one Node.js app, one deploy, hostname-based routing. Not a second codebase.

1. **Hostname routing in `src/middleware.ts`.** Today's middleware (`withAuth`, matcher excludes `/login`, `/api/auth`, `/api/cron`, static assets) protects *everything else*. Split by `request.headers.get("host")`:
   - `sistema.contador.com.py` (and any preview/staging host) → today's behavior unchanged, `withAuth` gate stays exactly as-is.
   - `contador.com.py` / `www.contador.com.py` (the apex) → **no auth check**, routed to a new public route group; any accidental hit on an app path (`/invoices`, `/settings`, …) on the apex host 404s or redirects to the marketing home, it does not fall through to the software.
   - Do this with an explicit host allowlist, not a "assume app unless marketing path matches" default — a misconfigured host must fail closed (marketing), never leak an app route unauthenticated.
2. **New route group `src/app/(marketing)/`** — fully public, no session, no Prisma calls that assume a company (`getCompanyId()` must never be reached from here). Server Components, static/ISR where possible for Core Web Vitals. Pages: home, servicios (facturación electrónica, libros IVA, F.120, IRP — described as *services a firm performs*, not *features of a product*), sobre-nosotros, contacto (WhatsApp + form → existing `mailer.ts` or a lead table, no `Client`/`Company` coupling), and a blog/guides section if SEO strategy wants ongoing content. Spanish-first copy (voseo, matching `locales/es.json` conventions), separate from the app's i18n dictionaries since the audience and tone differ.
3. **SEO baseline**: per-page `generateMetadata`, `sitemap.ts`, `robots.ts` scoped to the marketing group only (the app host should stay `noindex` — add `X-Robots-Tag: noindex` or a robots meta on every `(app)` response when host is `sistema.*`), JSON-LD `AccountingService`/`LocalBusiness` schema, OpenGraph images. Reuse `paraguay-business-apps`/`web-design-system` skill guidance for the actual page build when that starts — this phase only stages the plan.
4. **DNS/hosting**: both `contador.com.py` (apex) and `sistema.contador.com.py` point at the *same* Node.js app on the new Hostinger Node.js hosting slot (migrating off the current static-HTML hosting for the apex). No new `$PORT`/env split — one process serves both hosts, matching `next.config.ts`'s existing `output: "standalone"` setup. Follow the `nextjs-deploy-hostinger` skill for the actual subdomain mapping steps when this is executed.
5. **Ordering**: this can proceed in parallel with Phases 5–8 — it touches middleware and adds a new route group, no shared code with the tax/accounting modules. Sequence it before Phase 8's one-time-invoice-link (`/e/[token]`) and any future public-facing intake route, since those need the host-split decided first (is `/e/[token]` served on `sistema.*` only, or also the apex? — default: `sistema.*` only, keep the apex purely marketing).

**Not in scope here:** rewriting the existing static HTML content — that's copy/design work for whoever builds `(marketing)/`, not an architecture decision. This phase is the routing/hosting seam only.

## Explicitly out of scope

Competitor B's service lines — RUC registration in Marangatú, rented address + utility bills, rental contracts, physical mail reception/forwarding, tax residency certificate issuance, apostille and shipping. These are an operations business staffed by humans, not features. If we ever sell them, the software side is already covered: Phase 6's vault delivers the documents and Phase 5's job engine handles renewal reminders. Nothing further to build.

Also still refused, per STRATEGY: portal credential custody, auto-filing to Marangatú, and "never wrong" accuracy claims.

## Sequencing & effort

| Phase | Depends on | Rough size |
|---|---|---|
| 1 — F.120 draft + close report | nothing new | ✅ shipped |
| 2 — Deducibility | Phase 1 UI shell | ✅ shipped |
| 3 — DE import | mapping vocabulary (exists) | ✅ shipped |
| 4 — Delivery | Phases 1–3 | folded into Phase 5 |
| 5 — Calendar + filing archive | nothing new | calendar module + 1 migration + 1 route + cron wiring |
| 6 — Vault + roles | Phase 5 (filings feed the vault) | 1 model + 1 route + auth pass over every action |
| 7 — IRP | Phases 2 and 5 | new math module + 1 route, sized like Phase 1 |
| 8 — Intake channels | Phase 6 roles | link flow small; WhatsApp gated on Meta approval |
| 9 — Marketing/app domain split | nothing new; sequence before 8's public link route | middleware host-split + new route group + DNS move, no shared code with tax/accounting |

Build order within Phase 5: calendar → `TaxFiling` migration → status actions → historial route → deadline card → reminder jobs. The calendar comes first because everything else displays its output.

Tests to keep green throughout: existing money/RUC/CDC/sequence suites, plus new fixtures for f120 math and deductibility rules — these are money-path and get the same "protect the money" treatment as `tests/`.
