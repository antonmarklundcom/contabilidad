# PLAN.md — Feature roadmap

What we build next, in order, and why. Companion docs: `ARCHITECTURE.md` (how it fits the codebase), `STRATEGY.md` (why these choices vs. the competition).

## Context

A competitor is publicly demoing an AI accountant for Paraguay that: classifies sales into Formulario 120 casillas (Rubro 1), registers comprobantes, decides deducibility item-by-item across photographed and electronic invoices, reconciles app records against Marangatú, prepares/"sends" the F.120, and delivers a full PDF report via WhatsApp — claiming it "never makes mistakes."

We already have the foundation they'd need: real SIFEN emission (mock + real adapters), OCR expense capture with **local** validation, libro de ventas/compras, IVA débito/crédito position, KuDE PDFs, a job queue, and audit logging. The plan below closes the visible feature gap and beats them on trustworthiness.

## Status at a glance

| Phase | State |
|---|---|
| 1 — F.120 draft + reconciliation + close | ✅ built |
| 2 — Deducibility (AI-suggested, human-decided) | ✅ built |
| 3 — External comprobante import | ✅ built (CDC lookup pending) |
| 4 — Close integrity & delivery | ⏳ current focus |
| 5 — Payments & cuentas por cobrar | ⬜ next |

## Phase 1 — Monthly IVA close & Formulario 120 draft ✅ DONE

Shipped as `src/lib/form120.ts` (pure `computeForm120` + DB `buildForm120`), `src/lib/reconcile.ts` (unresolved invoices/expenses/duplicates), the `/taxes` route (period picker, débito/crédito cards, liquidación, discrepancy tables), `src/lib/tax-report.ts` (F.120 working-draft PDF + informe mensual PDF, both labeled "borrador de trabajo"), and `closePeriod`/`reopenPeriod` with human sign-off recorded via `audit()`. Saldo anterior is editable per period (`SaldoAnteriorForm`).

**Deliberately out of scope, permanently:** auto-submitting the F.120 to Marangatú. There is no public filing API; automating it means storing the client's SET login and screen-scraping a government portal. We produce a *transcription-ready* draft instead. See STRATEGY.md §Risk. (SIFEN emission is different — it has an official web-services API and we already use it through the adapter.)

## Phase 2 — Deducibility engine ✅ DONE

Item-level `deduciblePercent` on `ExpenseItem` (expense-level fallback), pure math in `src/lib/deductibility.ts` (tested, header-IVA-capped), OCR suggests `deducibilidadSugerida` per item with reason (Ley 6380/19 prompt context) — **the human decides**; deducible IVA feeds the F.120 crédito fiscal. Supplier→category memory reduces repeat review.

## Phase 3 — External comprobante import ✅ MOSTLY DONE

`src/lib/marangatu-import.ts` parses Marangatú "Consulta de comprobantes" exports (flexible header matching, RUC DV validation) → bulk-creates expenses via `/expenses/import`; duplicate matching on (RUC, número, fecha, total) merges photographed and electronic twins.

**Remaining:** the "paste CDC" verification flow — run `queryStatus` through the SIFEN adapter to confirm a received document is real and APPROVED before trusting it. Small; do alongside Phase 4 or 5.

## Phase 4 — Close integrity & delivery ⏳ CURRENT

The close exists but isn't yet airtight or delivered. Four gaps, in build order:

1. **Saldo a favor carry-forward.** Closing a period with `saldoAFavor > 0` must seed the next period's `saldoAnterior` automatically (still user-overridable). Today the user retypes it — the one place a transcription error can silently corrupt next month's liquidación.
2. **Frozen close artifacts.** `closePeriodAction` stores a JSON snapshot, but the PDF export routes regenerate from *live* data — figures can drift after close (late expense edits, reopened documents). At close time, generate the F.120 draft PDF and informe mensual PDF and store them under `STORAGE_DIR/exports` (tax-doc policy: never deleted); record the filenames in the close record; the `/taxes` page links the frozen files when the period is closed.
3. **Vencimiento awareness.** `src/lib/tax-calendar.ts`: the DNIT perpetual calendar (RUC last digit → due day) as pure, tested functions. Show "vence el dd/mm" on `/taxes`; weekend fallthrough to the next business day (holidays documented as a limitation).
4. **Delivery.** A `send_report` job (existing mailer, existing queue) that emails the frozen close PDFs to the company email after close, when SMTP is configured. Cron (`/api/cron`) additionally enqueues a reminder email a few days before the due date if the previous period isn't closed yet — "your draft declaration is waiting." WhatsApp stays the honest share flow (open with message; true auto-send only via the paid WhatsApp Business API, evaluated when a client pays for it).

## Phase 5 — Payments & cuentas por cobrar ⬜ NEXT

Emission and the monthly close are the compliance loop; getting paid is the daily loop. Nothing tracks payments today (no `Payment` model).

1. **Schema:** `Payment` (companyId, invoiceId, date, amount, currency, method enum: `EFECTIVO | TRANSFERENCIA | TARJETA | CHEQUE | BILLETERA | QR`, reference, note) + on `Invoice`: `paymentCondition` (`CONTADO | CREDITO`), `dueDate`, derived `paidTotal`/`paymentStatus` (`PENDIENTE | PARCIAL | PAGADA | VENCIDA`). Partial payments are normal; PYG integer amounts throughout.
2. **Register payment** flow on the invoice detail (server action, zod, `audit()`); payment history list per invoice and per client.
3. **Cuentas por cobrar view:** aging report (al día / 1–30 / 31–60 / 60+ días) as the "who owes me" screen, with the existing list-controls conventions (search, filters, CSV export).
4. **Cobro via WhatsApp:** one-tap `wa.me` reminder link per overdue invoice (prefilled message with number, amount, due date). Manual first — same honesty rule as report delivery.
5. **Accounting tie-in:** dashboard gains cobrado vs. facturado for the period; the informe mensual gets a cartera section (facturado, cobrado, vencido). IVA stays accrual-based (por lo devengado) — payments do NOT change the F.120 math.
6. **Later (demand-driven):** nota de crédito flow tied to the original invoice; presupuestos/cotizaciones convertible to invoices; bank-statement reconciliation.

## Sequencing & effort

| Phase | Depends on | Rough size |
|---|---|---|
| 4 — Close integrity & delivery | nothing new | carry-forward + PDF freeze + calendar + 1 job |
| 3-remainder — CDC lookup | SIFEN adapter (exists) | 1 small flow |
| 5 — Payments & CxC | nothing new | 1 model + 1 flow + 1 view + wa.me links |

Tests to keep green throughout: existing money/RUC/CDC/sequence/f120/deductibility suites, plus new fixtures for the tax calendar and carry-forward — money-path code gets the same "protect the money" treatment as `tests/`.
