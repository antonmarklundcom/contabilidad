# FacturaPY

Electronic invoicing for Paraguay (Documentos Tributarios Electrónicos / DTE via **SIFEN**, DNIT) **plus automatic bookkeeping**. Single-tenant today, multi-tenant-ready (every business table carries `companyId`).

Built with **Next.js 15 (App Router) + TypeScript**, **PostgreSQL + Prisma**, **Tailwind CSS + shadcn-style UI**, **NextAuth** (credentials), and the open-source **TIPS S.A.** SIFEN libraries. Runs on a plain Node.js host (no Redis, no Docker required).

> **The digital certificate does not exist yet.** The app runs today in **mock mode** (`SIFEN_MODE=mock`): it builds *real* XML with the real `xmlgen` library, computes a *real* 44-digit CDC, and simulates SIFEN's approve/reject responses so the whole flow is exercised end to end. When the `.p12` arrives, flip one env var and drop in the file — see **[When the certificate arrives](#when-the-certificate-arrives)**.

---

## Quick start (local, mock mode)

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
#    - set DATABASE_URL to your Postgres
#    - set ADMIN_EMAIL / ADMIN_PASSWORD
#    - generate NEXTAUTH_SECRET:  openssl rand -base64 32
#    - generate ENCRYPTION_KEY:   openssl rand -hex 32
#    (leave SIFEN_MODE=mock; ANTHROPIC_API_KEY optional for now)

# 3. Create schema + demo data
npx prisma db push
npm run db:seed

# 4. Run
npm run dev        # http://localhost:3000  → log in with ADMIN_EMAIL / ADMIN_PASSWORD
```

The seed creates a clearly-labeled **demo company** (RUC `80000000-5`), 5 clients, 10 products, 15 invoices in mixed statuses, and 10 expenses, so every screen is browsable immediately. All demo records say "demo" — nothing pretends to be real.

### End-to-end smoke test (mock mode)

Create client → create invoice → **Emitir** → approved (mock) → download **KuDE PDF** with QR → upload a receipt photo → OCR → confirm → both **Libros IVA** show the numbers → export CSV/XLSX. The command-line equivalents live in `scripts/smoke-sifen.ts` and `scripts/smoke-emit.ts` (`npx tsx scripts/smoke-emit.ts`).

---

## Environment variables

Copy `.env.example` and fill these in:

| Variable | Required | Example / notes |
|---|---|---|
| `DATABASE_URL` | ✅ | `postgresql://user:pass@localhost:5432/facturapy` (MySQL works too — schema is cross-compatible) |
| `ADMIN_EMAIL` | ✅ | `admin@example.com` — seeded admin user |
| `ADMIN_PASSWORD` | ✅ | strong password; hashed with bcrypt on seed |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | `https://facturas.tudominio.com` (prod) / `http://localhost:3000` (dev) |
| `SIFEN_MODE` | ✅ | `mock` (default) · `test` · `production` |
| `CERT_P12_PATH` | test/prod | filesystem path to the `.p12` (optional if uploaded in Settings) |
| `CERT_P12_PASSWORD` | test/prod | certificate password (optional if uploaded in Settings) |
| `SIFEN_CSC` | test/prod | Código de Seguridad del Contribuyente (DNIT), used for the QR |
| `SIFEN_CSC_ID` | test/prod | CSC id, e.g. `0001` |
| `ANTHROPIC_API_KEY` | optional | enables receipt OCR (`claude-sonnet-4-6` vision) |
| `OCR_MODEL` | optional | override the OCR model id |
| `STORAGE_DIR` | ✅ | `./storage` — **must persist across deploys** (xml, kude, receipts, exports, certs) |
| `ENCRYPTION_KEY` | ✅ | `openssl rand -hex 32` (64 hex chars) — encrypts the `.p12` + password at rest |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | optional | email delivery of KuDE + XML |
| `CRON_SECRET` | ✅ | shared secret for `GET /api/cron` (external cron) |
| `PORT` | ✅ | server port (`process.env.PORT`) |

---

## Deploying on a Hostinger Node.js host

1. **Build command:** `npm install && npm run build`
   (`build` runs `prisma generate` then `next build` with `output: "standalone"`.)
2. **Start command:** `npm start` (serves on `$PORT`).
3. **Database:** create a PostgreSQL (or MySQL) database and set `DATABASE_URL`. On first deploy run `npm run db:migrate` (or `npx prisma db push`) then `npm run db:seed` once.
4. **Persistent storage:** point `STORAGE_DIR` at a directory that survives redeploys. **Tax documents (XML, KuDE) are never deleted — 5-year legal retention.** Back it up.
5. **Environment variables:** set every required var from the table above in the host's env panel.
6. **Background jobs:** a job runner starts in-process on boot. Also configure an **external cron** to hit the queue and trigger nightly backups:
   ```
   * * * * *  curl -s -H "x-cron-secret: $CRON_SECRET" https://tudominio.com/api/cron
   ```
   (Every minute is fine; the runner claims due jobs and no-ops otherwise.)
7. **robots.txt** already returns `Disallow: /` — this subdomain is app-only.

---

## When the certificate arrives

A future session can execute this checklist verbatim. **Keep it simple.**

1. **Upload the `.p12`.** Log in → **Settings → Certificate** → upload the `.p12` and enter its password. It is stored **encrypted** (AES-256-GCM) under `STORAGE_DIR/certs`; the expiry date is read and shown on the dashboard (warnings at 60/30/7 days). *(Alternative: set `CERT_P12_PATH` + `CERT_P12_PASSWORD` env vars instead.)*
2. **Set the CSC.** Set `SIFEN_CSC` and `SIFEN_CSC_ID` (from DNIT) in the environment — required to generate the QR.
3. **Switch to test.** Set `SIFEN_MODE=test` and restart the app. It now hits SIFEN's **homologación** endpoints with the real libraries.
4. **Run homologación.** SIFEN requires issuing test documents of each type you'll use before authorizing production. At minimum:
   - Factura electrónica (contado **and** crédito)
   - Nota de crédito electrónica (referencing an approved factura)
   - Nota de débito electrónica
   - A cancellation event (evento de cancelación) within 48 h
   - A RUC query (consulta RUC)

   Verify each is **Aprobado** and that the KuDE + QR validate on `ekuatia.set.gov.py/consultas-test`.
5. **Go to production.** Once DNIT authorizes the RUC as facturador electrónico, set `SIFEN_MODE=production` and restart. Documents are now fiscally valid.

Nothing else in the code changes — every SIFEN call goes through the adapter (`src/lib/sifen/`), and the real adapter is already written (see `CLAUDE.md`).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | `prisma generate` + `next build` (standalone) |
| `npm start` | Production server |
| `npm test` | Vitest (RUC check digit, CDC format, IVA/totals math, sequence concurrency) |
| `npm run db:push` | Push schema to the DB, no migration files — **local scratch only** |
| `npm run db:migrate` | Apply `prisma/migrations` (production, CI) |
| `npx prisma migrate dev --name <change>` | Create a migration — required for every schema change |
| `npm run db:seed` | Seed admin user + demo data |

---

## License / attribution

SIFEN XML generation, signing, transport and QR are handled by the MIT-licensed **TIPS S.A.** packages (`facturacionelectronicapy-*`). Everything else is this application.
