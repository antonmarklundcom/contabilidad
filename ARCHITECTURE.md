# ARCHITECTURE.md — Current system & planned extensions

How FacturaPY is built today and how the PLAN.md phases attach to it without breaking the existing boundaries. Conventions and gotchas live in `CLAUDE.md`; this doc is the structural map.

## Current architecture (as-built)

```
Next.js 15 App Router (standalone, single process)
│
├── src/app/(app)/…            Server Components per module
│   ├── invoices/  clients/  products/   emission side
│   ├── expenses/                        capture side (OCR upload + review)
│   ├── books/  reports/                 accounting outputs
│   └── settings/                        company, cert, sequences, users
│
├── src/lib/
│   ├── sifen/                 ★ THE boundary. All SIFEN traffic.
│   │   ├── types.ts           SifenAdapter interface + DTOs
│   │   ├── mock-adapter.ts    default; real xmlgen, fake sign/send
│   │   ├── real-adapter.ts    xmlgen+xmlsign+setapi+qrgen
│   │   ├── mapping.ts         Prisma → Manual Técnico 150 JSON
│   │   ├── ruc.ts / cdc.ts    local módulo-11, tested vs library
│   │   └── errors.ts / log.ts bilingual codes; SifenLog persistence
│   ├── dte.ts                 emit → send → cancel lifecycle
│   ├── accounting.ts          libroVentas/libroCompras/dashboard/trend
│   ├── ocr.ts                 vision extraction + LOCAL validation
│   ├── jobs/                  DB queue + in-process runner + /api/cron
│   ├── kude.ts                pdfkit KuDE generator
│   ├── money.ts               PYG no-decimals; IVA-included extraction
│   ├── storage.ts             disk under STORAGE_DIR; tax docs immortal
│   ├── crypto.ts              AES-256-GCM for .p12 + password
│   └── audit.ts               best-effort who/what/when
│
└── Prisma/PostgreSQL
    User, Company, Establishment, ExpeditionPoint, DocumentSequence,
    Client, Product, Invoice, InvoiceLine, ExpenseCategory, Expense,
    SupplierCategoryMap, JobQueue, SifenLog, AuditLog, Setting
```

Load-bearing invariants (do not weaken while extending):

1. **App code never touches `facturacionelectronicapy-*` directly** — only through the `SifenAdapter`.
2. **AI output is never trusted for arithmetic or identifiers** — `validateExtraction` recomputes locally (RUC check digit, totals). Any new AI feature inherits this rule.
3. **Money is deterministic**: PYG integers end-to-end; IVA extracted from IVA-included prices; covered by tests.
4. **Sequential numbers are race-safe** (atomic increment) and gaps are detectable.
5. **Every company-scoped query filters by `companyId`** via `getCompanyId()` — the multi-tenant seam.
6. **Tax artifacts are write-once** on disk; mutations audit().

## Extension 1 — Tax module — PLAN Phase 1–2 (BUILT)

Implemented as flat siblings in `src/lib/` (same "pure core, thin edges" shape as planned, without the `tax/` subfolder):

```
src/lib/
├── form120.ts        pure computeForm120 + DB buildForm120; saldo anterior,
│                     PeriodClose record, carry-forward. Fixture-tested.
├── reconcile.ts      discrepancy checks: unapproved invoices in period,
│                     needs-review expenses, duplicate suspects.
├── deductibility.ts  pure per-item deducible math (header-IVA-capped);
│                     the AI SUGGESTION lives in ocr.ts (deducibilidadSugerida
│                     per item, with reason) — the human decides.
├── tax-report.ts     F.120 working-draft PDF + informe mensual (pdfkit).
├── tax-calendar.ts   DNIT perpetual due-date calendar (RUC last digit →
│                     due day, weekend shift). Pure, tested.
└── tax-close.ts      close artifacts (frozen PDFs under exports/), report
                      email, declaration reminder (cron-driven).
```

Schema notes (as built):

- `PeriodClose` is stored as a JSON value in the existing `Setting` table (`f120.closed.YYYY-MM` per company): `closedBy`, `closedAt`, `snapshot`, `files` (frozen PDF names). Same guarantees as the planned model — closing snapshots the figures AND the PDFs, so later edits can't silently rewrite a declared month; reopening is an explicit audited action. Promote to a real table when multi-tenant reporting needs to query across closes.
- Deducibility is `deduciblePercent` (0–100) on `ExpenseItem` with expense-level fallback — finer-grained than the planned enum; `libroCompras`/F.120 count only the deducible fraction.

Route: `/taxes` (Server Component, period picker via URL params) with server actions in colocated `actions.ts` (`revalidatePath`, `audit()`).

Jobs: `send_report` (frozen close PDFs by email), `declaration_reminder`.

## Extension 2 — External comprobante import (PLAN Phase 3, BUILT)

Sits beside OCR as a second intake lane for expenses. As built, the import consumes Marangatú's **"Consulta de comprobantes" spreadsheet export** (electronic AND virtual comprobantes) rather than raw DE XML — it covers more document types and needs no XML parsing:

```
upload XLSX/CSV (user-exported from Marangatú)
   → src/lib/marangatu-import.ts: flexible header matching, RUC DV validation
   → match against existing expenses on (supplierRuc, número, fecha, total)
   → merge or create; conflicts go to the review screen, not auto-resolved
```

Route: `/expenses/import` + `/api/expenses/import`. **Remaining:** the "paste CDC" verification flow through `adapter.queryStatus` to confirm a received document is APPROVED.

No Marangatú credentials, ever: import is user-initiated file upload; verification goes through the official consulta service via the existing adapter interface.

## Extension 3 — Close integrity & delivery (PLAN Phase 4, BUILT)

- Closing generates the two PDFs and stores them under `exports/` (never deleted); the export routes serve the frozen file for closed periods, and the close's `saldoAFavor` seeds the next period's saldo anterior automatically (still user-overridable).
- `send_report` job: `mailer.ts` + frozen PDF attachments, enqueued on close when SMTP + company email exist.
- Cron: `/api/cron` calls `enqueueDeclarationReminderIfDue()` — perpetual-calendar due date (`tax-calendar.ts`), one reminder per period per company (Setting marker), only if the period isn't closed.
- WhatsApp stays share-intent (honest manual attach) until/unless WhatsApp Business API is adopted; that would be a new `src/lib/whatsapp.ts` behind its own interface, mockable like the SIFEN adapter.

## What deliberately does NOT get built

- **No Marangatú portal automation** (login, scraping, headless filing). Off-architecture: it would require storing SET credentials, breaks on every portal change, and sits outside the official-API-only boundary that `sifen/` enforces.
- **No AI in the money path.** AI classifies and suggests (deducibility, OCR fields); every figure that reaches a casilla is recomputed by pure tested functions.
- **No silent auto-decisions on tax positions.** `PENDING` is a first-class state; reports show it explicitly rather than guessing.

## Testing additions

- `tests/form120.test.ts` — fixture totals → expected liquidación (5%/10% mix, exentas, saldo anterior). ✅
- `tests/deductibility.test.ts` — per-item deducible math, header cap, fallback. ✅
- `tests/tax-calendar.test.ts` — perpetual-calendar table, weekend shift, year rollover. ✅
- `tests/parse-de.test.ts` — sample DE XML → parsed DTO → CDC re-validation.
- Reconciliation findings get golden-file tests (period fixture → expected findings list).

All follow the existing Vitest setup and the "skips gracefully if no DB" pattern where DB-bound.
