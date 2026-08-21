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

## Extension 1 — Tax module (`src/lib/tax/`) — PLAN Phase 1–2

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

- `send_report` job: `mailer.ts` + PDF attachment from storage. Enqueued on period close.
- Cron: `/api/cron` already runs due jobs; add a due-date check that enqueues a reminder based on SET's perpetual calendar (RUC last digit → due day), stored as data in `tax/calendar.ts`.
- WhatsApp stays share-intent (honest manual attach) until/unless WhatsApp Business API is adopted; that would be a new `src/lib/whatsapp.ts` behind its own interface, mockable like the SIFEN adapter.

## Extension 4 — Marketing/app domain split (PLAN Phase 9)

`contador.com.py` (marketing, SEO, "we are an accounting firm") and `sistema.contador.com.py` (this app, unchanged) served from the **same** Next.js process — no second codebase, no second deploy. The seam is `src/middleware.ts`, which currently gates everything except `/login`, `/api/auth`, `/api/cron`, and static assets behind `withAuth`.

```
src/middleware.ts
   host = request.headers.get("host")
   host in APP_HOSTS (sistema.contador.com.py, staging/preview hosts)
       → today's matcher + withAuth, unchanged
   host in MARKETING_HOSTS (contador.com.py, www.contador.com.py)
       → no auth; route to src/app/(marketing)/*
       → any (app) path hit on this host: 404 / redirect to marketing home,
         never fall through to an app route unauthenticated
   host matches neither (misconfigured DNS, unexpected Host header)
       → fail closed to marketing, never to the app
```

```
src/app/(marketing)/          new, public, no session
├── page.tsx                  home — firm framing, not product framing
├── servicios/                facturación electrónica, libros IVA, F.120, IRP
│                              described as services performed, not features
├── sobre-nosotros/
├── contacto/                 WhatsApp + form; does NOT touch getCompanyId()
│                              or any (app) Prisma model — a lead capture at
│                              most, never a Client/Company row
├── sitemap.ts / robots.ts    scoped to this group only
└── (blog/ if the SEO plan wants ongoing content)
```

Invariants this extension must not violate:
- `getCompanyId()` (the multi-tenant seam, see CLAUDE.md) is never reachable from `(marketing)` — there is no company context on the apex host.
- The app host stays `noindex` (`X-Robots-Tag` or robots meta on every `(app)` response when `host` is `sistema.*`) so the SEO investment lands only on the marketing host.
- One `next.config.ts`, one `output: "standalone"` process, one `$PORT` — both hosts point DNS at the same Hostinger Node.js deployment. No env/config fork per host.

Sequencing: independent of Phases 1–8 (touches only middleware + a new route group), but decide it *before* Phase 8's `/e/[token]` one-time invoice link — that route's host (app-only vs. also apex) depends on this split already existing. Default: `sistema.*` only.

## What deliberately does NOT get built

- **No Marangatú portal automation** (login, scraping, headless filing). Off-architecture: it would require storing SET credentials, breaks on every portal change, and sits outside the official-API-only boundary that `sifen/` enforces.
- **No AI in the money path.** AI classifies and suggests (deducibility, OCR fields); every figure that reaches a casilla is recomputed by pure tested functions.
- **No silent auto-decisions on tax positions.** `PENDING` is a first-class state; reports show it explicitly rather than guessing.

## Testing additions

- `tests/f120.test.ts` — fixture invoices/expenses → expected casillas (incl. 5%/10% mix, exentas, partial deductibility).
- `tests/deductibility-rules.test.ts` — the deterministic rules table.
- `tests/parse-de.test.ts` — sample DE XML → parsed DTO → CDC re-validation.
- Reconciliation findings get golden-file tests (period fixture → expected findings list).

All follow the existing Vitest setup and the "skips gracefully if no DB" pattern where DB-bound.
