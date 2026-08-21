# ARCHITECTURE.md — Current system & planned extensions

How FacturaPY is built today and how the PLAN.md phases attach to it without breaking the existing boundaries. Conventions and gotchas live in `CLAUDE.md`; this doc is the structural map.

## Current architecture (as-built)

```
Next.js 15 App Router (standalone, single process)
│
├── src/app/(app)/…            Server Components per module
│   ├── invoices/  clients/  products/   emission side
│   ├── expenses/                        capture side (OCR upload + review + import)
│   ├── books/  reports/                 accounting outputs
│   ├── taxes/                           F.120 draft, close, historial archive
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
│   ├── form120.ts             period → F.120 casillas (pure math) + saldo anterior
│   ├── reconcile.ts           period discrepancy checks (see Extension 1 status)
│   ├── tax-report.ts          F.120 / monthly close PDFs (pdfkit)
│   ├── deductibility.ts       per-item IVA + deducible totals (pure math)
│   ├── marangatu-import.ts    Marangatú CSV/XLSX comprobante-export parser
│   ├── notifications.ts       reminder ladder + NotificationLog dedup
│   ├── tax/                   calendar.ts (perpetual due dates), filing.ts
│   │                          (TaxFiling lifecycle), filing-status.ts (pure
│   │                          immutability guards), deadline.ts (next-due card)
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
    ExpenseItem, SupplierCategoryMap, TaxFiling, NotificationLog, JobQueue,
    SifenLog, AuditLog, Setting
```

Load-bearing invariants (do not weaken while extending):

1. **App code never touches `facturacionelectronicapy-*` directly** — only through the `SifenAdapter`.
2. **AI output is never trusted for arithmetic or identifiers** — `validateExtraction` recomputes locally (RUC check digit, totals). Any new AI feature inherits this rule.
3. **Money is deterministic**: PYG integers end-to-end; IVA extracted from IVA-included prices; covered by tests.
4. **Sequential numbers are race-safe** (atomic increment) and gaps are detectable.
5. **Every company-scoped query filters by `companyId`** via `getCompanyId()` — the multi-tenant seam.
6. **Tax artifacts are write-once** on disk; mutations audit(). The DB side is enforced too since PLAN Phase 5.10: `closePeriod`/`reopenPeriod` refuse to rewrite or withdraw a `SUBMITTED`/`PAID` filing, guarded atomically in the write statement itself (`tax/filing.ts`, rule in `tax/filing-status.ts`).

## Extension 1 — Tax module (`src/lib/tax/`) — PLAN Phase 1–2

> **Status: shipped, under different names.** This section is the pre-build sketch, kept for the rationale. As-built: the modules live directly in `src/lib/` — `form120.ts` (not `tax/f120.ts`), `reconcile.ts`, `tax-report.ts` (not `report-pdf.ts`), `deductibility.ts`; the route is `/taxes`, not `/reports/declaracion`; the `PeriodClose` model sketched below was first a `Setting` JSON blob and then replaced by the `TaxFiling` model (PLAN Phase 5.2); `Expense` gained an integer `deduciblePercent` + per-line `ExpenseItem` rows instead of the enum/confidence columns; PDFs are generated on demand (no `generate_close_report` job); and reconcile shipped **without** the sequence-gap check (PLAN Phase 5.9). Where this sketch and the code disagree, the code wins.

New sibling to `sifen/`, same "pure core, thin edges" shape:

```
src/lib/tax/
├── f120.ts           period → casilla map. Pure functions over the same
│                     query results accounting.ts already produces.
│                     No I/O, no AI. Fixture-tested.
├── reconcile.ts      discrepancy checks: unapproved invoices in period,
│                     sequence gaps, failed-validation expenses, duplicate
│                     suspects. Pure functions returning typed findings.
├── deductibility.ts  rules table (deterministic, data-driven) +
│                     AI fallback for ambiguous cases (ocr.ts pattern:
│                     messages.parse + zod + confidence). Suggests only.
└── report-pdf.ts     monthly close PDF via pdfkit (reuse kude.ts helpers;
                      extract shared bits into pdf-common.ts if needed).
```

Schema additions:

- `PeriodClose` model: `companyId`, `period` (YYYY-MM), casilla snapshot (JSON), `approvedByUserId`, `approvedAt`, `reportPath`. Unique on (`companyId`, `period`). Closing writes the snapshot so later data edits can't silently rewrite a declared month; re-opening is an explicit audited action.
- `Expense` gains `deductibility` enum + `deductibilityConfidence` + `deductibilityReason` + `deductibilityDecidedByUserId`. Default `PENDING`. `libroCompras`/f120 count IVA crédito only from `FULL`/`PARTIAL` confirmed rows.

Routes: `/reports/declaracion` (Server Component; period picker via URL params per list-controls convention) with server actions `closePeriod` / `reopenPeriod` in a colocated `actions.ts` (zod-validated, `revalidatePath`, `audit()`).

Jobs: `generate_close_report` (PDF build can be slow → queue it, mirror `generate_kude`), later `send_report`.

## Extension 2 — DE import (PLAN Phase 3)

> **Status: partially superseded.** What shipped is `src/lib/marangatu-import.ts` + `/api/expenses/import` — a Marangatú **CSV/XLSX comprobantes-export** importer with duplicate-skip on the (RUC, número, fecha, total) key. The XML DE lane sketched below (`sifen/parse-de.ts`, CDC re-validation, `queryDe` on the adapter) is **not built** and remains the design for when it is (PLAN Phase 5.8 carries the consulta piece).

Sits beside OCR as a second intake lane for expenses:

```
upload XML (user-exported from Marangatú)
   → parse against sifen/mapping.ts vocabulary  (no new field names!)
   → cdc.ts local validation of the CDC
   → optional adapter.queryStatus(cdc) to confirm APPROVED
   → match against existing expenses on (supplierRuc, número, fecha, total)
   → merge or create; conflicts go to the review screen, not auto-resolved
```

Route: `/api/expenses/import-xml` (multipart, same shape as `/api/expenses/upload`). Parser lives in `src/lib/sifen/parse-de.ts` because it's SIFEN-vocabulary work — keeping mapping knowledge in one place. **The parser only reads; it never invents fields not in the Manual Técnico README.**

No Marangatú credentials, ever: import is user-initiated file upload; verification goes through the official consulta service via the existing adapter interface (add a `queryDe(cdc)` method to `SifenAdapter` if the consulta response needs more than `queryStatus` returns — implement in both mock and real adapters).

## Extension 3 — Delivery (PLAN Phase 4)

> **Status: calendar shipped (PLAN 5.1) and the reminder job shipped (PLAN 5.6, `src/lib/notifications.ts` + the `filing_reminder` job scanned from `/api/cron`); `send_report` is still open** — `jobs/handlers.ts` today dispatches `send_dte`, `query_status`, `generate_kude`, `cancel_dte`, `backup`, `filing_reminder`.

- `send_report` job: `mailer.ts` + PDF attachment from storage. Enqueued on period close. Still open (PLAN 5.7).
- Cron: `/api/cron` runs due jobs and, since PLAN 5.6, scans for reminders — filing due dates from `tax/calendar.ts`, timbrado and certificate expiry from `Company` — deduped by `NotificationLog` (insert-first, unique violation = already sent) and no-op without SMTP.
- WhatsApp stays share-intent (honest manual attach) until/unless WhatsApp Business API is adopted; that would be a new `src/lib/whatsapp.ts` behind its own interface, mockable like the SIFEN adapter.

## Extension 4 — Marketing/app domain split (PLAN Phase 9)

`contador.com.py` (marketing/SEO) and `sistema.contador.com.py` (this app, unchanged) from the **same** standalone Next.js process. The seam is `src/middleware.ts`. Two mechanics PR #10's original sketch got wrong, corrected here:

1. **Host branch + rewrite, not just a route group.** Route groups don't change URL paths, so a `(marketing)/page.tsx` would collide with the existing `(app)/page.tsx` at `/` — a build error. The middleware must branch on `host` and *rewrite* marketing-host requests to a dedicated path prefix (e.g. `/marketing/*`); app hosts keep today's `withAuth` gate untouched. Unknown hosts fail closed to marketing, never to an app route; `/marketing/*` hit directly on the app host redirects out.
2. **Host-aware robots/sitemap.** `public/robots.txt` is a static `Disallow: /` served on every host — it must be replaced with per-host responses (marketing: allow + sitemap; app: disallow + `X-Robots-Tag: noindex`). The middleware matcher excludes `robots.txt` but not `sitemap.xml`; account for both when branching.

Invariants: `getCompanyId()` is never reachable from marketing pages (no company context on the apex); the contacto form writes a lead/mail, never a `Client`/`Company` row; one `next.config.ts`, one `$PORT`, no env fork per host.

## What deliberately does NOT get built

- **No Marangatú portal automation** (login, scraping, headless filing). Off-architecture: it would require storing SET credentials, breaks on every portal change, and sits outside the official-API-only boundary that `sifen/` enforces.
- **No AI in the money path.** AI classifies and suggests (deducibility, OCR fields); every figure that reaches a casilla is recomputed by pure tested functions.
- **No silent auto-decisions on tax positions.** `PENDING` is a first-class state; reports show it explicitly rather than guessing.

## Testing additions

Shipped: `tests/form120.test.ts` (casilla math), `tests/deductibility.test.ts` (per-item IVA/deducible math), `tests/tax-calendar.test.ts` (per-digit due-date fixtures), `tests/tax-filing-migration.test.ts` (executes the shipped migration SQL, proves idempotence).

Still missing, and worth building before the modules are touched again:

- Golden-file tests for `marangatu-import.ts` — STRATEGY's format-drift mitigation assumes these exist; they don't.
- Reconciliation golden-file tests (period fixture → expected findings list) — `reconcile.ts` currently has no tests at all.
- `tests/parse-de.test.ts` — sample DE XML → parsed DTO → CDC re-validation (when the XML lane is built).
Also shipped: `tests/notifications.test.ts` (reminder threshold ladder, both-locale copy, DB dedup/no-SMTP/recipient roles) and `tests/tax-filing-guards.test.ts` — deny paths for the Phase 5.10 filing status guards (reopen/re-close of `SUBMITTED`/`PAID` refuse and leave the row intact).

All follow the existing Vitest setup and the "skips gracefully if no DB" pattern where DB-bound.
