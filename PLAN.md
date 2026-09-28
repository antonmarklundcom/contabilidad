# PLAN.md — Feature roadmap

What we build next, in order, and why. Companion docs: `ARCHITECTURE.md` (how it fits the codebase), `STRATEGY.md` (why these choices vs. the competition).

## Status at a glance

| Phase | Scope | Status |
|---|---|---|
| 1 | F.120 draft, reconciliation, `/taxes`, close + sign-off | **Shipped** (`form120.ts`, `reconcile.ts`, `tax-report.ts`); the sequence-gap check followed in 5.9 |
| 2 | Item-level deducibility | **Shipped** (`deductibility.ts`, `ExpenseItem`) — AI suggests at OCR time; no rules table, see Phase 2 note |
| 3 | Marangatú import & matching | **Shipped** in full — spreadsheet import (`marangatu-import.ts`) *and* e-Kuatiá XML DE import with CDC validation and OCR-twin merging (`ekuatia-xml.ts`) |
| 4 | Delivery & polish | **Folded into Phase 5** — report email + reminders shipped there; WhatsApp auto-send is Phase 8.2 |
| 5 | Compliance calendar & filing archive | **Shipped** — 5.1–5.10 all done, including 5.8 (paste-a-CDC consulta) |
| 6 | Document vault & client portal roles | **Shipped** — vault, role enforcement, multi-tenant activation |
| 7 | Annual IRP return | **Shipped** (`irp.ts`, `/taxes/anual`) — RSP wired; RGC is a declared stub, see Phase 7 note |
| 8 | Intake channels (WhatsApp, one-time invoice link) | 8.1 **shipped** (`/e/[token]`); 8.2 (WhatsApp) still gated |
| 9 | Public site: `contador.com.py` marketing + `sistema.contador.com.py` app split | **Code shipped** (`hosts.ts`, host-aware robots/sitemap, `src/app/marketing/` placeholders); DNS move is the owner's call. Real marketing copy lives in the separate `contador` repo (static PHP site) — see Phase 9 note |
| 0 | **Fix-first hardening** (before any client depends on the numbers) | **Next** — see "Phase 0" below |
| 10 | DNIT padrón sync + supplier status checks | **Shipped (code)** — needs `PADRON_BASE_URL` and a first real sync on the host |
| 11 | RG 90 libro export in Marangatú's upload format | Planned — gated on a real sample file |
| 12 | Accountant exception queue across all clients | Planned |

**Direction (2026-09):** the product is an *accountant operating system* first and a DIY tool second. In Paraguay a freelance contador costs ~₲100–150k/month, so a self-service SaaS saves the client almost nothing and removes the person who carries the liability. The margin is in making one accountant handle hundreds of clients: the client sends receipts, the machine books and checks everything, and a human only looks at exceptions. Every phase from 0 onward is judged by "does this cut accountant minutes per client per month without adding risk?". Sold two ways: our own firm (via the `contador.com.py` site) and licensed to other estudios per client. Market figures quoted in planning notes (padrón size, fine amounts, share of PJ RUCs) are secondary-source and unverified — do not put them in UI or marketing copy until checked against DNIT.

## Phase 0 — Fix first (hardening before scale)

The shipped features are broad; these are the places where they can currently produce a *wrong tax figure* or leak between tenants once a second client exists. They come before any new feature because the accountant-OS direction multiplies each of them by the number of clients.

1. **Deducibility default is not a decision (downgraded after checking the code).** Unreviewed expenses do **not** reach IVA crédito: every OCR, Marangatú and XML capture lands as `NEEDS_REVIEW`, and only a human "Confirm" puts it in `libroCompras`. What remains is softer: at confirm time an item left at the default 100 % looks the same as one a human chose. Worth a "reviewed deducibility" flag once Phase 12's queue exists, not a blocker now. (Also: the `importMarangatuRows` docstring still says it imports as CONFIRMED — it does not.)
2. **Owner verification of the two corroborated tables.** `PERPETUAL_CALENDAR` (persisted into `TaxFiling.dueDate`) and `IRP_REGIMES` are secondary-source only. Owner downloads the DNIT resolutions from a normal network and commits them under `docs/sources/`; the table edits cite them. Also answer the IRP regime question (RSP vs RGC) for the first clients. Until done, the deadline card and IRP PDF should carry a visible "fecha/tabla sin verificar" note.
3. ✅ **Backup cannot cross tenants.** `/api/settings/backup` and the nightly job dump the whole DB and storage root. Shipped: `instanceBackupAccess()` in `backup.ts` — both GET and POST now require `settings:write` (GET had no capability check in the route, only the middleware) **and** a single-company instance; with a second company the download is refused (`multi_tenant`, audited), the settings tab explains why, and the nightly zip stays on disk for the operator. Downloads are audited. Tested in `tests/backup-access.test.ts`. Still open: a per-company export (rows + that company's files) so tenants can take their own data.
4. **Tenant + user provisioning.** Two parts:
   - ✅ **4a — one accountant, many companies.** `Membership` (user ↔ company, backfilled from `User.companyId` in the `membership` migration, idempotent and tested). `User.companyId` stays the default company. The active company is the httpOnly `active_company` cookie set by `switchCompany` (`src/app/(app)/actions.ts`), and `getCompanyId()` honours it **only while a membership backs it** — re-checked per request, so a hand-edited cookie or a revoked membership falls back to the default. Roles stay per user (an accountant is one in every company they belong to) so the edge middleware can keep gating without a DB query. Header switcher appears with >1 company. `audit()` records the active company. Tests: `company-scope.test.ts`, `membership-migration.test.ts`.
   - ✅ **4b — provisioning UI.** `/companies` lists the companies the user belongs to (search + pagination), with "Abrir" to switch in. `/companies/new` reuses the Settings company form in `create` mode: DV recomputed with `ruc.ts`, 8-digit timbrado, full address required, duplicate RUC refused; the creator becomes a member and lands in the new company's Settings. "Agregar usuario" (admin only) gives an existing login access, or creates one with an admin-chosen initial password (never logged). New capabilities: `companies:create` (admin, accountant), `users:manage` (admin). Rules pure in `src/lib/company-admin.ts`, tested in `tests/company-admin.test.ts`. Not built: removing a membership, a user changing their own password on first login being forced.
5. ✅ **Stale-doc cleanup** (done with this plan update). CLAUDE.md still warned that `reopenPeriod`/`closePeriod` lack status guards — they shipped in 5.10. Remove the warning so future sessions don't re-implement it. Keep this table in sync when a phase ships.
6. ✅ **DB-backed reconciliation test** — already existed (`tests/reconcile.test.ts` is a DB golden test); the Phase 1 note was stale.

Exit: all six done, `npm test` + lint green, migrations replay clean in CI.

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

**Shipped-vs-sketch gaps in item 2:** `buildReconciliation()` covers unapproved invoices, `NEEDS_REVIEW` expenses (which subsumes the failed-local-validation bullet — a failed validation leaves the expense in `NEEDS_REVIEW`), and duplicate suspects. The **sequence-gap check over `DocumentSequence` ranges** shipped later, as Phase 5.9, with pure fixtures in `tests/reconcile-sequence.test.ts`; the DB-backed findings list is still untested.

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

**How the shipped mechanism differs from items 1–2 above:** `deductibility.ts` is pure math only (`computeDeducible`, `itemIva`) — there is **no deterministic rules table and no separate Anthropic call**. The AI suggestion rides the OCR extraction itself: `/api/expenses/upload` stores each item's `deducibilidadSugerida`/`motivoDeducibilidad` as `deduciblePercent`/`deducibleReason` with `aiSuggested: true`, and the review UI renders AI-suggested reductions amber until a human edits or confirms. There is no `PENDING` state (items default to 100% deductible) and no supplier-memory for deducibility decisions. The rules-first triage STRATEGY's cost-mitigation row assumed does not exist — if expense volume makes OCR-time suggestion too coarse or costly, build the rules table then.

## Phase 3 — External comprobante import & reconciliation ✅ shipped

The competitor ingests "electrónicas y virtuales que están en Marangatú." We do the same without credentials:

1. **XML DE upload**: accept e-Kuatia XML files the user downloads themselves (Marangatú lets taxpayers export their received DEs). Parse with the same field vocabulary as `sifen/mapping.ts`; validate CDC with our local `cdc.ts`; create/match expenses. Batch upload.
2. **CDC lookup**: a "paste CDC" flow that runs `queryStatus`/consulta through the existing SIFEN adapter to verify a received document is real and APPROVED before trusting it — a check the competitor doesn't show.
3. Reconcile imported DEs against OCR-captured expenses (match on RUC + número + fecha + total, the existing duplicate-detection key) so a photographed invoice and its electronic twin merge instead of double-counting.

**Item 1 (XML DE upload) and item 3 (merging) shipped later — see the second note below.** The first thing to ship was `src/lib/marangatu-import.ts` + `/api/expenses/import`, which is a Marangatú "consulta de comprobantes" CSV/XLSX export importer, not the XML DE upload item 1 describes. The parser does flexible (case/accent-insensitive) header matching over Marangatú's spreadsheet exports; there is no e-Kuatia XML parsing and no CDC validation (the spreadsheet export carries no CDC column). Matching (item 3) shipped as duplicate-*skip* on the (RUC, número, fecha, total) key — an imported electronic twin of a photographed invoice is skipped, not merged, so no double-counting but also no enrichment. The parser's golden-file tests landed later (`tests/marangatu-import.test.ts` + fixtures), and caught three silent bugs: UTF-8 CSV headers being read as CP1252, a missing `RUC con DV` alias, and error rows reporting the wrong line number after a blank line.

**Items 1 and 3 — ✅ now shipped** as `src/lib/ekuatia-xml.ts` + `/api/expenses/import-xml` + an XML tab on `/expenses/import`. (Item 2 shipped separately as Phase 5.8.)

- **The vocabulary is not invented.** The element names are the ones our own `xmlgen` output uses, because we emit the same document type we are reading. `tests/fixtures/ekuatia/` holds XML produced by the **real library** through our own emission path, so the parser is tested against the generator rather than against an idea of the format — the same discipline as `tests/fixtures/marangatu/`. Three input shapes are accepted, because all three are what people have on disk: a bare `<rDE>`, a signed one with a `<Signature>` sibling, and a DE inside a response envelope.
- **The CDC is validated with `cdc.ts`, and then cross-checked against the document body** using `comprobante-check.ts` — the same code Phase 5.8's paste-a-CDC flow uses, not a second copy. An XML whose `dRucEm`/`dNumDoc`/`dFeEmiDE` disagrees with the identity baked into its own CDC is **refused**: it is corrupted or edited, and either way a human should see it before it becomes a tax figure. Importing is **not** verifying: the CDC is stored so the consulta is one click away, but no verdict is claimed, because nobody asked SIFEN. The signature is not checked either — that needs SIFEN's certificate chain, and the honest answer to "is this real and approved" is the consulta.
- **Merging, item 3, is the substantive change over the spreadsheet importer.** The twin is matched on issuer RUC + document number and deliberately **NOT** on the amount. `findDuplicate` includes the total because two captures of one comprobante should agree; here the whole point is that they may not — an OCR read of a creased receipt gets the total wrong, and matching on it would miss the twin and book the purchase twice. A given issuer cannot reuse a number, so RUC + número *is* the document's identity.
- **What the merge may and may not do.** Where the XML meets an unreviewed OCR capture the electronic figures win, since the XML is the authoritative record. Where it meets an expense a **human already confirmed**, the amounts are left exactly as signed off, the CDC and a note are attached, and the disagreement is reported as a `conflict` — the same rule as `TaxFiling`'s declared snapshots (Phase 5.10): an import does not get to rewrite a reviewed figure. Re-importing the same CDC is a no-op. A DE issued to a **different** RUC is refused outright, because a mixed-up batch of downloads becoming your IVA credit is the mistake this exists to prevent.
- One corrupted file never costs the user the other forty-nine: parse failures are reported per file and the batch continues.
- Tests: `tests/ekuatia-xml.test.ts` (21, golden fixtures) and `tests/ekuatia-import.test.ts` (7, DB-backed merge semantics). `xml2js` became a direct dependency — it was already in the tree under `xmlgen`, and depending on a transitive dep is not a dependency.

## Phase 4 — Delivery & polish (partial)

1. **Email delivery** of the monthly close PDF via existing `mailer.ts`, enqueued as a `send_report` job after period close.
2. **WhatsApp**: keep the current honest share flow (open WhatsApp with message, user attaches PDF). True auto-send requires the WhatsApp Business API — evaluate cost/approval then; do not fake it.
3. **Scheduled close reminder**: cron job that, a few days before the F.120 due date (per SET's perpetual calendar by RUC last digit), emails/notifies "your draft declaration is ready to review."
4. Multi-tenant activation (the `companyId` groundwork already exists) once a second client wants in.

None of the four are done. Items 1 and 3 are absorbed into Phase 5, which gives them the calendar they were missing.

## Phase 5 — Compliance calendar & filing archive (next)

Competitor B's two strongest portal screens — "next deadline, N days remaining" and "all filings, box by box, with the official PDF." Both are cheap for us because the numbers already exist; what's missing is a due date and a durable record.

1. **`src/lib/tax/calendar.ts`** — ✅ **shipped**. SET's perpetual calendar: due date for a period keyed by the **last digit of the RUC**. Pure functions (`ivaDueDate`, `irpDueDate`, `daysUntil`, plus `nextIvaFiling`), table-as-data (`PERPETUAL_CALENDAR`) so a resolution change is a one-line edit. Weekend/holiday roll-forward with Easter-derived and fixed national holidays; decree-declared asuetos are a caller-supplied option because they are not perpetual. Fixtures per digit in `tests/tax-calendar.test.ts`. ⚠️ The digit→day table (0→7 … 9→25, matching the shape of Resolución General 38/2020) is corroborated across four sources but **not** verified against a primary DNIT document — the build environment blocks `dnit.gov.py`. **This has become load-bearing since it shipped:** `TaxFiling.dueDate` is persisted from it and the deadline card displays it, so it needs owner verification against the DNIT resolution *before the first production filing*, not "eventually".
2. **`TaxFiling` model** — ✅ **shipped**. Replaces the `PeriodClose` JSON blob previously stashed in `Setting`. Fields: `companyId, type (IVA|IRP), year, month?, status (DRAFT|CLOSED|SUBMITTED|PAID), dueDate, snapshot Json, closedBy, closedAt, submittedAt, paidAt, officialPdfPath, notes`. `closePeriod()`/`getPeriodClose()`/`reopenPeriod()` live in `src/lib/tax/filing.ts` and are re-exported from `form120.ts`, so callers were untouched. Snapshot is immutable — reopening deletes the filing rather than editing it. The `20260804094717_tax_filing` migration **copies** the old `Setting` rows across and leaves them in place; the copy is idempotent (`ON CONFLICT DO NOTHING`) and proven by `tests/tax-filing-migration.test.ts`, which executes the shipped SQL itself. ~~Known gap: Postgres treats NULLs as distinct, so the unique constraint does not dedupe annual (`month IS NULL`) filings~~ — **fixed** ahead of Phase 7 by the `20260826094302_taxfiling_annual_month_sentinel` migration: `month` is NOT NULL and annual filings carry the sentinel `0` (`ANNUAL_MONTH`, `src/lib/tax/filing-period.ts`), so the existing constraint dedupes both kinds. The two alternatives were rejected because CI could not guard them — a partial unique index is not expressible in the Prisma schema and shows up as drift on every `migrate diff`, and `NULLS NOT DISTINCT` (PG 15+) is not expressible *or* modelled by the diff, so a later `migrate dev` could silently drop it. Covered by `tests/tax-filing-annual-dedupe.test.ts`.
3. **Filing status transitions** — ✅ **shipped**. Mark submitted / mark paid server actions (zod-validated, `audit()`ed, company-scoped), plus an upload slot for the DNIT receipt PDF in a new `STORAGE_DIR/filings` bucket. Replacing a receipt writes a new file and repoints the filing; the previous one stays on disk.
4. **`/taxes/historial`** — ✅ **shipped**. Filing list using the standard `list-controls` conventions (search, date range, status, pagination, CSV via `/api/export/filings`), each row drilling into `/taxes/historial/[id]`: the frozen snapshot's casilla table, the lifecycle timeline, the receipt PDF and a notes field.
5. **Deadline card** — ✅ **shipped**. `src/components/deadline-card.tsx` on both the dashboard and `/taxes`: next filing, due date, days remaining, current status. An unsubmitted filing already past its due date outranks the upcoming one, since that is the more urgent thing to show. Renders nothing when the RUC cannot be parsed rather than showing a date we cannot stand behind.
6. **Reminder + expiry jobs** — ✅ **shipped**. `src/lib/notifications.ts` + a `filing_reminder` job type, scanned from `/api/cron` on every tick. Covers the next IVA filing (10/3/1 days, from `tax/calendar.ts` via `tax/deadline.ts`, skipping periods already `SUBMITTED`/`PAID`) and **timbrado** + **certificate** expiry (60/30/7 days). `reminderThreshold()` is pure and fixture-tested: the smallest threshold still covering "days remaining" wins, so each rung fires once as the date approaches. Dedup is the `NotificationLog` model — unique on `(companyId, kind, subject, threshold)`, inserted *before* the job is queued, a `P2002` read as "already sent" (and the row deleted again if the enqueue fails, so a failed scan retries). `subject` carries the thing expiring (period, timbrado number + end date, cert expiry date) so a *renewal* alerts afresh. Email goes through `mailer.ts` in the recipient's locale (`notifications.*` in both dictionaries) to the company address plus its admin/accountant users — never `client`-role users. With `smtpConfigured()` false the scan writes nothing and queues nothing, so reminders start flowing the day SMTP is configured rather than being permanently marked as sent. Schema: `Company.timbradoFechaFin` (nullable, editable in Settings — blank simply silences timbrado reminders) + `NotificationLog`, in the `20260821093759_notification_log_and_timbrado_fin` migration. Tests: `tests/notifications.test.ts` (pure ladder, both-locale copy, and DB coverage of dedup, the SMTP no-op and recipient roles).

7. **Phase 4 items 1 & 3 land here** — ✅ **shipped**. Two pieces:
   - **`send_report`** job, enqueued by `closePeriodAction` after a successful close: renders the monthly report, writes it to `STORAGE_DIR/exports` and emails it to the same recipients the reminders use. Queued rather than inline so a slow or missing SMTP host can never make closing a period fail; no-ops cleanly without SMTP. The report assembly moved out of `/api/export/tax-report` into `src/lib/tax/monthly-report.ts`, so the downloaded and the emailed report are the same document instead of two code paths.
   - **Month-end pre-computation** (STRATEGY's "zero minutes beats four"): `src/lib/tax/precompute.ts`, run from `/api/cron`, writes a `DRAFT` `TaxFiling` with the just-ended period's figures so the draft is *already waiting* at login. Idempotent — an existing filing in any status is left untouched, and a concurrent runner loses to the unique constraint. A DRAFT snapshot is a convenience copy, not a declared figure: `getPeriodClose()` still ignores DRAFT rows and `closePeriod()` overwrites it with the figures as of sign-off. `/taxes` says when the draft was prepared.

8. **Paste-a-CDC consulta** (carried from Phase 3.2) — ✅ **shipped**. `src/lib/comprobante-check.ts` + `POST /api/comprobantes/verify` + a panel on the expense detail page. Paste the 44-digit CDC of a received electronic document and find out whether it is real, approved, and *actually the one you were handed*.
   - **Local first, network second, deliberately in that order.** Length and the módulo-11 check digit are proved with `cdc.ts` and no network: a malformed CDC is a *certain* failure, and a certain answer must not be made uncertain by a round trip that might time out. A typo therefore never reaches SIFEN.
   - **The cross-check is the part a status query alone cannot do.** The CDC encodes the issuer's RUC, the document number and the issue date, so all three are compared against the captured expense with no network at all. A genuine, SIFEN-approved document that is simply *not* the one in front of you comes back `mismatch` — the case a naive consulta waves through. RUCs compare with or without the DV and ignoring leading zeros; numbers compare unpadded; a **missing** captured field is nothing to compare, not a mismatch.
   - **Verdict precedence:** structural failure ⇒ `rejected` (SIFEN never asked); SIFEN not-approved ⇒ `rejected`; a local error ⇒ `mismatch`, outranking an "Aprobado"; SIFEN unreachable ⇒ `unknown`, **never** upgraded to `verified`. A date mismatch is a *warning*, not an error — the CDC carries the issue date and a captured expense is sometimes dated by receipt or payment.
   - Output is a **findings list**, not a boolean, for the same reason `reconcile.ts` reports findings. SIFEN's own message is shown verbatim; our dictionary explains around it and never replaces it. Every consulta goes through `logSifen()`, and the last verdict is stored on the `Expense` (`cdc`, `cdcVerdict`, `cdcEstado`, `cdcMensaje`, `cdcVerifiedAt`, `cdcVerifiedBy`, in the `20260826102845_expense_cdc_verification` migration) — the last verdict, not a history: re-checking is cheap and a stale "verified" is worth less than a fresh one.
   - `tests/comprobante-check.test.ts` (30) is pure throughout: the adapter is injected, so even the SIFEN branch runs with no database and no certificate, and the fixture CDCs are built with `buildCdc` so their check digits are genuine rather than hand-typed.
9. **Sequence-gap check in reconciliation** (carried from Phase 1.2) — ✅ **shipped**. `findSequenceGaps()` in `reconcile.ts` is pure and fixture-tested (`tests/reconcile-sequence.test.ts`); `buildReconciliation()` feeds it every numbered document plus the `DocumentSequence` counters. Two findings: a number missing *inside* the period's own range, and a trailing run the sequence reserved that no document ever claimed (the crash-between-increment-and-insert case), reported once — on the period holding the newest document. The window is the period's own numbers, so a company that started mid-sequence is not accused of a gap it never emitted, and membership is checked against the series' whole history, so a back-dated document elsewhere is not a false positive. A cancelled or rejected document still consumes its number and is therefore not a gap. Deliberately **not** part of `clean`: a burned number cannot be un-burned, so blocking the close on it would block it forever — it is a disclosure, shown on `/taxes` with that explanation, not a to-do.

10. **Filing status guards** — ✅ **shipped**. Filing immutability is now enforced in the data layer, not only the UI. The rule lives in `src/lib/tax/filing-status.ts` (pure, client-safe, so the `/taxes` UI shares the exact predicate the server enforces): only `DRAFT`/`CLOSED` filings may be rewritten. `reopenPeriod()` carries the status filter inside its `deleteMany` (check and delete in one statement) and returns `{ ok: false, reason: "locked", status }` for a `SUBMITTED`/`PAID` filing; a period with no filing stays a no-op. `closePeriod()` likewise refuses to overwrite a declared snapshot, and its update path filters on status so a filing submitted between the read and the write is re-read rather than overwritten. Both refusals are `audit()`ed (`close_refused`/`reopen_refused`) and surfaced with a bilingual hint; the reopen button is not offered once the filing is declared. Deny paths covered by `tests/tax-filing-guards.test.ts` (pure predicates everywhere, DB deny paths when `DATABASE_URL` is reachable).

## Phase 6 — Document vault & client portal roles

Their "Mailbox" screen, minus the physical mail operation. This is what makes the app usable *by the client* rather than only by the bookkeeper.

1. **`Document` model** — ✅ **shipped** as described (`companyId, kind, title, filePath, mimeType, sizeBytes, receivedAt, uploadedBy, notes`), in the `document_vault` migration, with a new read-confined `STORAGE_DIR/documents` bucket. Uploads are type- and size-checked server-side (documents only, 20 MB); files are written once and never deleted, like every other tax-document bucket.
2. **`/documents` route** — ✅ **shipped**. Upload dialog, list with the standard list-controls (search, kind filter, date range, pagination, CSV via `/api/export/documents`), download through `/api/documents/[id]`. Uploading a DNIT receipt on a filing also records a `FILING` document pointing at the same file (`linkExistingFile`, idempotent on the path), so the vault is not a second silo. `src/lib/documents.ts` scopes every read and write by `companyId` as well as id — covered by deny-path tests in `tests/documents.test.ts`.
3. **Role enforcement** — ✅ **shipped**. `src/lib/roles.ts` is the single pure table: three roles, a capability list per role (`invoices:write/emit`, `catalog:write`, `expenses:write`, `documents:write`, `taxes:close`, `settings:write`) and the route rules. `admin` gets everything; `accountant` everything but company settings; `client` reads the company's data and contributes the two things only they have — receipts and documents — with no emission, no period close, no settings. An unknown or missing role normalises to `client`, never to `admin`. Enforced in `middleware.ts` (a signed-in role that may not open a path is bounced to the dashboard, or gets a 403 on `/api/*`) **and** inside every mutating server action and write API route via `allowed()` (`src/lib/authz.ts`), which audits the refusal. Route gating is deliberately short: it covers the pages that *change* something (settings, invoice new/edit, the tax pages and filing endpoints), not the ones that only display data the client owns. `tests/roles.test.ts` covers the deny paths per role and per route, plus a structural test asserting every exported mutating server action checks a capability — which caught one that did not (`setSequenceNumber`).
4. **Multi-tenant activation** (carried from Phase 4.4) — ✅ **shipped**. `getCompanyId()` is the session's `companyId`. The decision is a pure function (`resolveCompanyId`) so both branches are tested: a signed-in user with no company is **refused** rather than handed the first company in the database, and a session-less caller (the job runner, `/api/cron`, scripts) gets the sole company when there is exactly one and is refused as `ambiguous` when there are several — it must pass the company explicitly instead of having a tenant picked for it. Every "the company" lookup that used `findFirst()` is scoped now: the DTE lifecycle takes the company from the invoice it is working on (a job has no session), the real adapter loads *that tenant's* certificate via `CompanyConfig.companyId`, and the app shell and invoice email read the session's company. Every other query already filtered by `companyId`, so nothing else had to change — which was the point of the invariant.

   **Known limits of the activation, for whoever adds the second tenant:** the nightly backup and `/api/settings/backup` dump the whole database and the whole storage root, so a backup is instance-wide, not per-tenant — fine while one operator runs the instance, wrong the moment tenants are separate customers who may download it (the endpoint requires `settings:write`, which no `client` has). There is also no UI for creating a company or assigning users to one: a second tenant is inserted by hand today.

## Phase 7 — Annual income tax return (IRP) ✅ shipped

The one genuine functional gap: we do IVA only, they file IRP too, and IRP is the reason a residency client keeps a RUC at all.

1. **`src/lib/irp.ts`** — ✅ **shipped**. (Note the path: directly in `src/lib/`, following the shipped Phase 1 layout rather than the `src/lib/tax/` sketch.) Annual aggregation of income and deductible expense into the IRP rubros, built on the same `libroVentas`/`libroCompras` primitives — twelve months read one at a time and folded, so an annual figure is *by construction* the sum of the monthly ones a client already reviewed. `computeIrp` is pure; `buildIrp` does the I/O. Fixtures per bracket in `tests/irp.test.ts`.
2. **`/taxes/anual`** — ✅ **shipped**. Mirrors `/taxes`: year picker, rubro tables, annual discrepancy list, close + sign-off, PDF via `tax-report.ts` (`generateIrpPdf`, which prints the tranche-by-tranche derivation, not just the answer). Defaults to *last* year, since the current fiscal year is not filable yet. A closed year renders the declared snapshot rather than a live recomputation.
3. ✅ Reuses Phase 5's `TaxFiling` (`type = IRP`, `month = ANNUAL_MONTH`) and `irpDueDate` — no parallel machinery. `closeFiling`/`reopenFiling` are the existing guards generalised over the tax, so IVA and IRP share one immutability rule rather than growing two. The archive gained a tax filter; its CSV gained IRP columns, blank on IVA rows and vice versa (a blank means "not applicable", a 0 would claim nothing was owed).
4. **Regime:** ⚠️ **still unanswered, deliberately not guessed.** Neither this document nor STRATEGY says whether the wedge users are IRP-RSP or IRP-RGC, so nothing picked one: `IRP_REGIMES` is a data table and the bracket engine reads it, RSP is wired end to end (`status: "ready"`), and RGC ships as a declared `stub` whose close the server refuses. The regime is stored per company as an explicit choice (`irp.regime` setting) — an unset regime blocks the close rather than defaulting. Answering the question is a one-line table edit.

⚠️ **`IRP_REGIMES` is corroborated, not verified** — same standing caveat as `PERPETUAL_CALENDAR`. The bracket table, the incidence threshold and the deduction rules are attributed to Ley N° 6380/2019 + Decreto N° 3184/2019 and agree across independent secondary sources, but the primary text could not be read: the build environment's egress proxy denies `dnit.gov.py`, `bacn.gov.py` and `impuestospy.com`. Verify against the DNIT/BACN document **before the first production filing**.

⚠️ **The deducible fraction is a proxy.** It is derived from the Phase 2 IVA-deducibility decisions (credited IVA ÷ invoiced IVA, per rate), because that is the only per-expense judgement a human has actually made in this system. "May this purchase's IVA be credited?" is not the same legal test as "is this cost deductible against personal income tax?". The draft says so on screen and in the PDF rather than implying the number is an IRP determination. Exempt purchases carry no IVA and therefore no decision, so they are counted in full and shown on their own line.

## Phase 8 — Intake channels (gated)

Lowering the friction of getting a receipt into the books. Both are real product, both have a gate.

1. **One-time invoice link** — ✅ **shipped**. `/e/[token]`: a minimal emission form that calls the existing `emitInvoice()` with no login and no install. `src/lib/invoice-link.ts` + the `InvoiceLink` model + the `20260826101035_invoice_link` migration.
   - **The token is never stored** — only `HMAC-SHA256(token)` under `INVOICE_LINK_SECRET` (falling back to `NEXTAUTH_SECRET`), the password-reset-token pattern. A read of the table yields nothing redeemable; a *write* to it cannot forge a link either, because minting a row for a chosen token needs the key. The raw token exists once, in the URL; the issuing dialog says so rather than letting the operator assume they can come back for it.
   - **Expiry is server-side only.** It lives in `InvoiceLink.expiresAt` and is compared against the server's clock. The token is opaque randomness carrying no readable payload — the deliberate difference from a self-describing JWT: there is nothing in it for a client to edit and nothing about the deadline the client is trusted to report. TTL is `INVOICE_LINK_TTL_MINUTES`, default 30, **clamped to 5..1440** so a typo cannot mint a month-long link.
   - **Single use is a claim, not a check**: a conditional `updateMany` flips `usedAt`, so concurrent redemptions produce one winner at the database rather than a race. The claim happens **before** emission — a burned link that emitted nothing is a nuisance, two DTEs from one link would burn two sequence numbers and put a duplicate into SIFEN. Proven by an 8-way concurrent test and end to end against a real Postgres.
   - **Scope is pinned at issue time**: company, document type (Factura only — a nota de crédito needs an original to reference) and expedition point come off the stored row. The redeemer chooses only the buyer and the lines; a payload trying to name another company or document type is ignored, verified end to end.
   - Issued from `/invoices` by anyone with `invoices:emit` (so a `client` role cannot mint one), `audit()`ed on both mint and redemption — **without** the token, since an audit log holding a live credential is a second copy of it. `/e/` is excluded from the middleware matcher; `/e/[token]/kude` serves that link's own document and nothing else, so the token cannot be walked into the company's other invoices.
   - Expiry gates **emission**, not the receipt: a redeemed link keeps showing its document afterwards, since withholding their own copy from the person who created it helps nobody.
   - `tests/invoice-link.test.ts` covers the token shape and opacity, the key-dependence of the hash, the TTL clamping, expiry against the server clock, single use, and the concurrent double submit. `tests/roles.test.ts` learned about session-less actions: the exemption **swaps** the guarantee (must claim a token) rather than dropping it.
2. **WhatsApp receipt intake** — WhatsApp Business API webhook → media download → the existing `/api/expenses/upload` OCR pipeline → normal amber-confidence review. **Gate:** requires a Meta Business account, a verified number and per-conversation costs. Evaluate before committing. Until then the honest share flow (Phase 4.2) stands — do not simulate an inbound channel we don't have.

## Phase 9 — Public site: `contador.com.py` marketing + `sistema.contador.com.py` app split

Proposed in PR #10 (merged); this section is that plan with the mechanics corrected after an audit pass (PR #10's sketch was never build-tested and had two blockers as written). The goal stands: `contador.com.py` reads as a normal Paraguayan accounting *firm* (SEO-optimized, no SaaS framing) while the software lives at `sistema.contador.com.py` — one Next.js process, one deploy, hostname-based routing.

1. **Hostname routing in `src/middleware.ts`** — replace the bare `export default withAuth(...)` with a middleware function that branches on host **and rewrites**:
   - App hosts (`sistema.contador.com.py`, staging/preview hosts) → today's `withAuth` behavior unchanged.
   - Marketing hosts (`contador.com.py`, `www.`) → **rewrite to a dedicated path prefix** (e.g. `/(marketing)` pages mounted under `src/app/marketing/…`, with the middleware rewriting `/` → `/marketing`, `/servicios` → `/marketing/servicios`, …). ⚠️ **This rewrite is not optional:** route groups don't change URL paths, so `(marketing)/page.tsx` and the existing `(app)/page.tsx` would both resolve to `/` — a Next.js build error. PR #10's "route to `src/app/(marketing)/*`" only works via host-conditional rewrites to non-colliding paths.
   - Any app path hit on a marketing host, and any unrecognized host, **fails closed to the marketing pages** — never falls through to an app route unauthenticated. Use an explicit app-host allowlist; direct navigation to `/marketing/*` on the app host should redirect out so the app host never serves indexable marketing copy.
2. **`robots.txt` / `sitemap.xml` must become host-aware.** Today `public/robots.txt` is a static `Disallow: /` — served identically on every host, it would block the marketing site's indexing, which defeats the phase. Delete the static file and serve robots per host (middleware rewrite to two routes, or one dynamic route reading `host`): marketing → allow + sitemap pointer; app host → disallow all, plus `X-Robots-Tag: noindex` on `(app)` responses. Note the middleware matcher currently excludes `robots.txt` but **not** `sitemap.xml` — a marketing sitemap would be auth-walled unless the matcher/branching accounts for it.
3. **Marketing pages** — public, no session, and `getCompanyId()` never reachable from them (no company context exists on the apex). Server Components, static/ISR for Core Web Vitals; Spanish-first (voseo) copy separate from the app's i18n dictionaries; pages: home, servicios (facturación electrónica, libros IVA, F.120, IRP — described as services performed, not product features), sobre-nosotros, contacto (WhatsApp + form → `mailer.ts` or a lead table; never a `Client`/`Company` row).
4. **SEO baseline**: per-page `generateMetadata`, JSON-LD `AccountingService`/`LocalBusiness`, OpenGraph images, sitemap per item 2.
5. **DNS/hosting**: apex + `sistema.` both point at the same Hostinger Node.js deployment (migrating the apex off its current static-HTML hosting). One `$PORT`, one `output: "standalone"` process, no env fork per host.
6. **Ordering**: independent of Phases 5–8 code-wise. The *decision* (which host serves public intake routes) should predate Phase 8's `/e/[token]` — default `sistema.*` only — but that is a decision, not a build dependency: Phase 8's link route does not need Phase 9 built first.

**Not in scope:** rewriting the existing static-HTML copy — that's design/copy work for whoever builds the marketing pages; this phase is the routing/hosting seam only.

**Status note:** items 1–4 shipped (`src/lib/hosts.ts`, `tests/host-routing.test.ts`, host-aware `robots.txt`/`sitemap.xml` route handlers, placeholder pages under `src/app/marketing/`). The public firm site is now being built separately as static HTML + PHP in the `contador` repo. Decide before the DNS move whether the apex is served by that PHP site (then delete `src/app/marketing/` and keep only the app host here) or by this app — not both.

## Phase 10 — DNIT padrón sync + supplier status checks ✅ code shipped

A purchase from a RUC that is `CANCELADO`, `BLOQUEADO` or `SUSPENSIÓN TEMPORAL` is a credit SET can question, and until now nothing noticed.

- **`DnitPadron`** (global, no `companyId` — public data, the one deliberate exception) + **`PadronSync`** (one row per attempt), in the `dnit_padron` migration.
- **`src/lib/padron.ts`**: downloads `ruc0.zip`…`ruc9.zip` from `PADRON_BASE_URL`, parses `RUC|RAZÓN SOCIAL|DV|RUC ANTERIOR|ESTADO|`, bulk-upserts via `UNNEST`. ⚠️ That layout could not be checked against a real file here (the build proxy blocks `dnit.gov.py`), so **the parser proves it on every file**: each row's DV is recomputed with `ruc.ts` and an archive with more than 2 % failures is refused as the wrong format. All ten archives are validated before any row is written; loading then goes one archive at a time to fit a small host's memory. Latin-1 files are decoded.
- **`padron_sync` job**, enqueued by `/api/cron` monthly after a success and at most daily after a failure (`padronSyncDue`, pure). Unset URL ⇒ `UNAVAILABLE`, no findings, no false alarms.
- **Reconciliation** gains `inactiveSuppliers`: confirmed purchases in the period whose supplier is not `ACTIVO`, shown on `/taxes` and `/taxes/anual` with the padrón date. **Not part of `clean`** — the padrón is today's status, not the status on the invoice date, so it is a disclosure to check, not a blocker.
- Tests: `tests/padron.test.ts` (parser, format self-test, zip, cadence, DB sync incl. the all-or-nothing refusal, reconciliation).
- **Owner steps:** put DNIT's download folder URL in `PADRON_BASE_URL` on the host; after the first cron run check `PadronSync` shows `OK` with ~2 M rows and near-zero `rejectedRows`. If it shows `FAILED … wrong format`, send one sample line and the parser gets fixed.
- **Not built yet:** padrón lookup at capture time (warning on the expense form, autofill of razón social) — next, small.

## Phase 11 — RG 90 libro export (Marangatú upload format)

Today the libros export as CSV/XLSX for humans. The accountant still re-keys or reformats them for Marangatú's RG 90 registro de comprobantes upload.

1. **Gate: a real sample.** Owner exports/downloads the official RG 90 layout (DNIT's specification or a file Marangatú accepted) into `tests/fixtures/rg90/`. The column order, separators, date format and tipo-de-comprobante codes come from that file — do not invent them.
2. **`src/lib/rg90.ts`** — pure: libro rows → RG 90 lines (ventas, compras; exenta / gravada 5 / gravada 10 buckets, timbrado, número, CDC where electronic). Only confirmed expenses and approved invoices; `PENDING` deducibility (Phase 0.1) is excluded or flagged, never exported silently.
3. `/api/export/rg90?year&month&libro=` + a button on `/books` and on the `/taxes` close screen. Golden-file tests.
4. Pre-export validation reuses `reconcile.ts`: refuse (with the findings list) if the period is not clean.

## Phase 12 — Accountant exception queue

The screen that turns "60 minutes per client" into "5". Depends on Phase 0.4 (one accountant ↔ many companies).

1. **`/queue`** (accountant/admin only): one list across every company the user belongs to, of items needing a human — low-confidence OCR fields, `NEEDS_REVIEW` expenses, `PENDING` deducibility, padrón failures (Phase 10), CDC `mismatch`, duplicate suspects, periods with a draft ready to close, and upcoming deadlines. Each row names the company.
2. **High-density review view:** receipt image beside the parsed fields, amber for low confidence, keyboard driven (j/k next/prev, a approve, e edit, d deducibility). Approving writes through the *same* server actions as the per-company screens (with `allowed()` and `audit()`), just with the company passed explicitly and checked against membership.
3. **Per-client month status board:** company × month grid (receipts in / exceptions open / draft ready / closed / submitted / paid). This is the firm's daily driver and the demo for licensing to other estudios.
4. Metric: store review time per item (`audit` timestamps) so "minutes per client" is measured, not claimed.

## Phase 8.2 revisited — WhatsApp intake

Unchanged gate (Meta Business account, verified number, per-conversation cost), but it is now the main client channel for the firm model, so it moves ahead of nice-to-haves once Phase 12 exists. Design notes for when it opens: sender phone → user → membership mapping (Phase 0.4); unknown numbers get a polite refusal and nothing is stored; media goes to `STORAGE_DIR/receipts` through the existing OCR job; the reply confirms what was captured and that a human will review it — never "added to your libro" before review.

## Explicitly out of scope

Competitor B's service lines — RUC registration in Marangatú, rented address + utility bills, rental contracts, physical mail reception/forwarding, tax residency certificate issuance, apostille and shipping. These are an operations business staffed by humans, not features. If we ever sell them, the software side is already covered: Phase 6's vault delivers the documents and Phase 5's job engine handles renewal reminders. Nothing further to build.

Also still refused, per STRATEGY: portal credential custody, auto-filing to Marangatú, and "never wrong" accuracy claims.

## Sequencing & effort

| Phase | Depends on | Rough size |
|---|---|---|
| 1 — F.120 draft + close report | nothing new | ✅ shipped |
| 2 — Deducibility | Phase 1 UI shell | ✅ shipped |
| 3 — DE import | mapping vocabulary (exists) | ✅ shipped (spreadsheet + XML DE) |
| 4 — Delivery | Phases 1–3 | folded into Phase 5 |
| 5 — Calendar + filing archive | nothing new | calendar module + 1 migration + 1 route + cron wiring |
| 6 — Vault + roles | Phase 5 (filings feed the vault) | 1 model + 1 route + auth pass over every action |
| 7 — IRP | Phases 2 and 5 | ✅ shipped |
| 8 — Intake channels | WhatsApp intake: Phase 6 roles (sender→company mapping); the one-time link is no-login by design and needs only the Phase 9 host decision, not roles | 8.1 ✅ shipped; WhatsApp gated on Meta approval |
| 9 — Marketing/app domain split | nothing (decision only should predate Phase 8's public link) | ✅ code shipped; DNS + apex-owner decision open |
| 0 — Fix first | nothing | 1 migration (PENDING) + backup scoping + membership model/UI + doc/test cleanup |
| 10 — Padrón | nothing (network access on the host) | 1 model + parser + job + import hooks |
| 11 — RG 90 export | real sample file from owner; Phase 0.1 | pure formatter + route + golden tests |
| 12 — Exception queue | Phase 0.4 membership; better with Phase 10 | 1 route + review UI + status board |
| 8.2 — WhatsApp | Meta approval; Phase 0.4 | webhook + sender mapping |

**Order from here:** 0 → 10 → 12 → 11 (as soon as the sample file arrives, it can jump ahead) → 8.2. Phase 0.1 and 0.3 are the most urgent: one can produce a wrong IVA figure, the other leaks data between tenants.

Tests to keep green throughout: existing money/RUC/CDC/sequence suites, plus new fixtures for f120 math and deductibility rules — these are money-path and get the same "protect the money" treatment as `tests/`.
