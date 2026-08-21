# CLAUDE.md — FacturaPY architecture & conventions

Context for future Claude Code sessions. Read this before making changes.

## What this is

Paraguayan electronic invoicing (SIFEN / DNIT DTE) + automatic accounting, as a single Next.js 15 app. Single-tenant now; **multi-tenant-ready** — every business table has `companyId`, and all queries filter by it via `getCompanyId()` (`src/lib/company.ts`). To go multi-tenant later, scope that lookup to the session instead of "the first company".

## Stack

- **Next.js 15 App Router + TypeScript**, `output: "standalone"` (Hostinger Node host, port from `$PORT`).
- **Prisma + PostgreSQL** (schema is MySQL-compatible — only shared features used). Client singleton in `src/lib/prisma.ts`.
- **Tailwind v4 + hand-written shadcn-style components** in `src/components/ui/` (Radix primitives; no shadcn CLI was used — the registry host is blocked, components were written directly).
- **NextAuth v4** credentials provider (`src/lib/auth.ts`), JWT sessions, bcrypt. `src/middleware.ts` protects everything except `/login`, `/api/auth`, `/api/cron`, and additionally gates paths by role.
- **Roles**: `src/lib/roles.ts` is the pure capability table (`admin` / `accountant` / `client`; unknown normalises to `client`). Every mutating server action and write API route calls `allowed(capability)` from `src/lib/authz.ts` — the middleware gate is convenience, the action check is the boundary. A structural test fails if a new action forgets.
- **No Redis / no Docker.** Background work is a DB-backed queue (`JobQueue` table) + an in-process runner + a cron endpoint.

## The SIFEN adapter — the core architectural boundary

Everything SIFEN goes through `src/lib/sifen/`. **Never call the `facturacionelectronicapy-*` libraries directly from app code — always go through the adapter.**

- `types.ts` — the `SifenAdapter` interface (generateXml, signXml, send, queryStatus, queryRuc, cancelDocument, generateQr) and the DTOs.
- `index.ts` — `getSifenMode()` reads `SIFEN_MODE`; `createSifenAdapter()` / `getSifenAdapterForCompany()` return the right implementation.
- `mock-adapter.ts` — **default.** Uses the REAL `xmlgen` to build+validate XML (and thus a real CDC), fakes the signature, simulates SIFEN (~90% approve / 10% reject with realistic codes from `errors.ts`), fake QR. Works with no certificate.
- `real-adapter.ts` — full implementation over `xmlgen` + `xmlsign` + `setapi` + `qrgen`. Resolves the `.p12` from `CERT_P12_PATH` or the encrypted upload in the DB. Complete but only smoke-testable once a real cert exists. `TODO(cert)` marks where real runtime values are needed.
- `mapping.ts` — maps our Prisma `Company`/`Invoice` to the `params`/`data` JSON the `xmlgen` README documents (Manual Técnico 150). **Field names come from that README — do not invent SIFEN fields.** Receiver address is intentionally omitted (SIFEN requires full geo codes for it, which we don't collect).
- `catalogs.ts` — re-exports SIFEN catalogs (departamentos/distritos/ciudades/países/unidades…) from the `xmlgen` package, so the whole app uses the exact codes the generator validates against.
- `ruc.ts` / `cdc.ts` — **RUC check digit and CDC** implemented locally to match the library's módulo-11 algorithm exactly (there are tests asserting equality against the library). `buildCdc` lets the mock produce structurally-real CDCs.
- `errors.ts` — bilingual (ES/EN) dictionary of SIFEN response codes + range fallbacks. The UI always shows SIFEN's verbatim message; these are *our* explanations. `MOCK_REJECTIONS` drives the mock's reject path.

Every SIFEN call is persisted to the `SifenLog` table via `logSifen()` (`log.ts`).

## DTE lifecycle

`src/lib/dte.ts` owns emit → send → cancel:
1. `emitInvoice()` — reserves the sequential number (`nextDocumentNumber`, atomic increment, race-safe), builds+signs XML, generates QR + KuDE PDF, sets status `QUEUED`, enqueues a `send_dte` job.
2. `sendInvoiceToSifen()` (job handler) — sends; on network failure → `CONTINGENCY` + retry; on verdict → `APPROVED`/`REJECTED`.
3. `cancelInvoice()` — evento de cancelación, enforces the 48h window (`cancelWindowOpen`).

KuDE PDF is `src/lib/kude.ts` (pdfkit + `qrcode`). In mock mode it stamps a "SIN VALOR FISCAL — SIMULACIÓN" watermark.

## Jobs

- `src/lib/jobs/queue.ts` — `enqueueJob()`, exponential backoff.
- `src/lib/jobs/runner.ts` — `startJobRunner()` (in-process interval, started from the app-group layout) + `runPendingJobs()` (also called by `/api/cron`). Jobs are claimed with an atomic `updateMany` so the interval and cron never double-run one.
- `src/lib/jobs/handlers.ts` — dispatch: `send_dte`, `query_status`, `generate_kude`, `cancel_dte`, `backup`, `filing_reminder`, `send_report`.
- `/api/cron` — authenticated by `x-cron-secret`; also enqueues the nightly backup if due, scans for compliance reminders, and pre-computes the month-end F.120 draft (`tax/precompute.ts`).
- `src/lib/notifications.ts` — filing/timbrado/certificate reminders. The threshold ladder is pure (`reminderThreshold`); "never twice" is the `NotificationLog` unique constraint, inserted *before* the job is queued so a unique violation means "already sent". No SMTP ⇒ nothing logged, nothing queued.

## Tax calendar & filings (`src/lib/tax/`)

- `calendar.ts` — SET's perpetual calendar: due dates keyed by the **last digit of the RUC** (excluding the DV). `PERPETUAL_CALENDAR` is a flat data table so a SET resolution change is a one-line edit — do not turn it back into arithmetic. Pure, no I/O. Non-working days roll **forward**; decree-declared asuetos are not perpetual and are passed in via `options.extraHolidays` rather than baked in. ⚠️ The digit→day table still needs verification against a primary DNIT document.
- `filing.ts` — the `TaxFiling` record: `closePeriod`/`getPeriodClose`/`reopenPeriod` (re-exported from `form120.ts` for existing callers), the status transitions, and the archive query. **Snapshots are immutable**: reopening deletes the filing, it never edits one. Every mutation is scoped by `companyId` as well as `id` — never trust an id alone.
- `deadline.ts` — the "next filing due" summary behind the deadline card.
- `monthly-report.ts` — assembles the monthly close report (shared by `/api/export/tax-report` and the `send_report` job) and mails it. `precompute.ts` — the month-end `DRAFT` filing, so the draft is waiting at login. A DRAFT snapshot is a convenience copy, never a declared figure.

## Accounting

`src/lib/accounting.ts` — `libroVentas` (approved invoices), `libroCompras` (confirmed expenses), `dashboardData` (income/expense + IVA débito/crédito position), `monthlyTrend`. Libros export CSV/XLSX via `/api/export/libro`.

Tax modules live directly in `src/lib/` (not `src/lib/tax/` — see ARCHITECTURE Extension 1 status note): `form120.ts` (casilla math + saldo anterior), `reconcile.ts` (period discrepancies + `findSequenceGaps`, pure and tested; gaps are disclosed, never part of `clean`), `tax-report.ts` (F.120/close PDFs), `deductibility.ts` (per-item IVA math — pure functions; the AI suggestion happens at OCR time, there is no rules table), `marangatu-import.ts` (CSV/XLSX comprobante-export parser). The `/taxes` route owns the close flow. ⚠️ `reopenPeriod`/`closePeriod` currently lack status guards (PLAN Phase 5.10) — do not rely on the DB to refuse rewriting a `SUBMITTED`/`PAID` filing.

## OCR

`src/lib/ocr.ts` — Anthropic vision (`claude-sonnet-4-6`, override with `OCR_MODEL`) + `messages.parse()` with a zod schema and per-field confidence. **Validation is always local** (`validateExtraction`): RUC check digit, totals math, date sanity — never trust the model's arithmetic. Upload route: `/api/expenses/upload`. Low-confidence fields render amber in the review screen. Duplicate detection on (supplierRuc, número, fecha, total). Supplier→category memory in `SupplierCategoryMap`.

## i18n

- Dictionaries: `locales/es.json` (Paraguayan Spanish, **voseo**) + `locales/en.json`. No hardcoded UI strings.
- Server: `src/lib/i18n-server.ts` (`getT()` reads the locale cookie). Client: `src/components/i18n-provider.tsx` (`useI18n()` → `t`, `money`, `num`, `date`, `dateTime`).
- Money: PYG has **no decimals** (`formatMoney`), enforced end-to-end (schema `@db.Decimal`, validators reject PYG decimals, UI steps by 1). `src/lib/money.ts` extracts IVA from **IVA-included** prices (SIFEN convention).
- Language switch writes a cookie + user profile via `/api/locale`.

## Storage & crypto

- `src/lib/storage.ts` — local disk under `STORAGE_DIR` (`/xml`, `/kude`, `/receipts`, `/exports`, `/certs`, `/logos`, `/filings`, `/documents`). Reads are confined to the storage root. **Tax docs are never deleted.** `/filings` holds DNIT acknowledgement PDFs for closed periods and `/documents` the vault's uploads (`src/lib/documents.ts`, `/documents` route — every read and write scoped by `companyId` as well as id); "replacing" one writes a *new* file and repoints the `TaxFiling`, leaving the old file on disk. Add a bucket by extending `STORAGE_SUBDIRS` — never write outside it.
- `src/lib/crypto.ts` — AES-256-GCM (`ENCRYPTION_KEY`, 32 bytes hex) for the `.p12` and its password. Cert expiry is read with `node-forge` (no JDK needed).

## Conventions

- Server Components fetch data; interactivity lives in `"use client"` components colocated in the route folder. Mutations are **server actions** (`actions.ts` per module) that validate with zod (`src/lib/validators.ts`), write, `revalidatePath`, and `audit()`.
- Lists are URL-driven (`src/components/list-controls.tsx`: SearchBox, DateRangeFilter, StatusFilter, Pagination, ExportCsvButton). Every list has search + date + status + pagination + CSV export.
- Status pills: `src/components/status-badge.tsx`. Layout shell: `src/components/app-shell.tsx` (sidebar + env badge — orange/mock, orange/test, green/prod).
- `audit()` (`src/lib/audit.ts`) records who/what/when — best-effort, never blocks.
- **Anti-fabrication:** no fake testimonials/stats/company data anywhere; demo data is labeled "demo".

## Tests

`tests/` (Vitest, `npm test`): RUC check digit vs the library, CDC format + library equality, IVA/totals math, sequence increment under concurrency (skips gracefully if no DB), F.120 casilla math (`form120.test.ts`), per-item deducibility math (`deductibility.test.ts`), perpetual-calendar due dates per RUC digit (`tax-calendar.test.ts`), TaxFiling migration idempotence (`tax-filing-migration.test.ts`), golden-file parsing of Marangatú exports (`marangatu-import.test.ts`, fixtures in `tests/fixtures/marangatu/`), and the period reconciliation findings list (`reconcile.test.ts`, `reconcile-sequence.test.ts`). These protect money; keep them green.

## Database changes

The schema has a real migration history under `prisma/migrations/`, starting
from `20260804000000_baseline` (generated from the schema as it stood when CI
was introduced — it is the state of the app at that commit, not a from-scratch
design).

- **Every change to `schema.prisma` ships with a migration in the same commit.**
  `npx prisma migrate dev --name <what_changed>`. CI replays the migrations into
  a shadow database and diffs against the schema; drift fails the build.
- `npm run db:push` is for local scratch work only. It writes no migration and
  will make CI fail on the next PR that touches the schema.
- **Existing deployments** created with `db push` before the baseline existed
  must adopt it once, or `migrate deploy` will try to recreate every table:
  `npx prisma migrate resolve --applied 20260804000000_baseline`.
- **Data migrations** (moving rows, not just changing shape — e.g. lifting the
  `PeriodClose` blob out of `Setting`) go in the migration's SQL when they can
  be expressed there, and must be idempotent. Tax documents are never deleted:
  a data migration copies and leaves the original, it does not move-and-drop.

## Gotchas

- `next.config.ts` lists the native/SIFEN packages in `serverExternalPackages` so they aren't bundled. ESLint is `ignoreDuringBuilds` (run `npm run lint` separately).
- Prisma is pinned to v6 (v7 engine download failed behind the proxy at build time; v6 works).
- shadcn components were hand-written — to add more, copy the pattern in `src/components/ui/`, don't rely on the CLI.
