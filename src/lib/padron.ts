/**
 * DNIT padrón de contribuyentes — local copy + supplier status (PLAN Phase 10).
 *
 * DNIT publishes the registry as ten zip archives (ruc0.zip … ruc9.zip), each
 * holding a pipe-delimited text file. We download them monthly, load them into
 * `DnitPadron`, and look suppliers up locally — no per-invoice network call.
 *
 * ⚠️ The line layout (`RUC|RAZÓN SOCIAL|DV|RUC ANTERIOR|ESTADO|`) is the
 * widely documented one but was NOT checked against a file downloaded in this
 * build environment (its proxy blocks dnit.gov.py). So the parser proves the
 * layout on every file instead of trusting it: each row's DV is recomputed
 * with `ruc.ts`, and a file where more than `MAX_REJECT_RATIO` of the rows fail
 * is refused as "wrong format" and loads nothing. A misread column cannot
 * produce a registry full of plausible-looking garbage.
 *
 * The download URL is configuration (`PADRON_BASE_URL`), never guessed. With
 * it unset the sync records UNAVAILABLE and every check stays silent — no
 * padrón means no findings, never false alarms.
 *
 * The padrón says what a supplier's status is TODAY. It is evidence about an
 * old purchase, not a verdict on it, which is why reconciliation discloses an
 * inactive supplier instead of blocking the close.
 */
import JSZip from "jszip";
import { prisma } from "@/lib/prisma";
import { calcularDigitoVerificador } from "@/lib/sifen/ruc";
import { enqueueJob } from "@/lib/jobs/queue";

export interface PadronRow {
  ruc: string;
  dv: string;
  razonSocial: string;
  rucAnterior: string | null;
  estado: string;
}

/** A file whose rows fail the DV check above this share is the wrong format. */
export const MAX_REJECT_RATIO = 0.02;

/** Base RUC as the padrón keys it: digits only, no leading zeros. */
export function normalizeRuc(ruc: string | null | undefined): string {
  return (ruc ?? "").replace(/\D/g, "").replace(/^0+/, "");
}

/** Only "ACTIVO" is active. Suspended, blocked and cancelled all are not. */
export function isActiveEstado(estado: string): boolean {
  return estado.trim().toUpperCase() === "ACTIVO";
}

/** One line → a row, or null when it is malformed or its DV does not check. */
export function parsePadronLine(line: string): PadronRow | null {
  const cols = line.replace(/\r$/, "").split("|");
  if (cols.length < 5) return null;
  const [rawRuc, razon, rawDv, rawAnterior, rawEstado] = cols;
  const ruc = normalizeRuc(rawRuc);
  const dv = (rawDv ?? "").trim();
  const estado = (rawEstado ?? "").trim();
  if (!ruc || !/^[0-9]$/.test(dv) || !estado) return null;
  if (String(calcularDigitoVerificador(ruc)) !== dv) return null;
  return {
    ruc,
    dv,
    razonSocial: (razon ?? "").trim(),
    rucAnterior: (rawAnterior ?? "").trim() || null,
    estado,
  };
}

export interface ParsedPadronFile {
  rows: PadronRow[];
  rejected: number;
}

export function parsePadronText(text: string): ParsedPadronFile {
  const rows: PadronRow[] = [];
  let rejected = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const row = parsePadronLine(line);
    if (row) rows.push(row);
    else rejected++;
  }
  return { rows, rejected };
}

/** Throws when a file does not look like the padrón. Pure. */
export function assertPlausible(file: ParsedPadronFile, name: string): void {
  const total = file.rows.length + file.rejected;
  if (file.rows.length === 0) throw new Error(`${name}: no valid rows — wrong format?`);
  if (file.rejected / total > MAX_REJECT_RATIO) {
    throw new Error(
      `${name}: ${file.rejected} of ${total} rows failed the RUC check digit — wrong format, nothing loaded`
    );
  }
}

/** UTF-8 when it decodes cleanly, Latin-1 otherwise (older DNIT exports). */
export function decodePadron(buf: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8").decode(buf);
  return utf8.includes("�") ? new TextDecoder("latin1").decode(buf) : utf8;
}

/** Extracts and parses every .txt inside one archive. */
export async function parsePadronZip(zipBytes: Uint8Array, name: string): Promise<ParsedPadronFile> {
  const zip = await JSZip.loadAsync(zipBytes);
  const out: ParsedPadronFile = { rows: [], rejected: 0 };
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || !/\.txt$/i.test(entry.name)) continue;
    const parsed = parsePadronText(decodePadron(await entry.async("uint8array")));
    out.rows.push(...parsed.rows);
    out.rejected += parsed.rejected;
  }
  assertPlausible(out, name);
  return out;
}

const BATCH = 1000;

async function upsertRows(rows: PadronRow[], syncedAt: Date): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    await prisma.$executeRaw`
      INSERT INTO "DnitPadron" ("ruc", "dv", "razonSocial", "estado", "rucAnterior", "syncedAt")
      SELECT * FROM UNNEST(
        ${chunk.map((r) => r.ruc)}::text[],
        ${chunk.map((r) => r.dv)}::text[],
        ${chunk.map((r) => r.razonSocial)}::text[],
        ${chunk.map((r) => r.estado)}::text[],
        ${chunk.map((r) => r.rucAnterior)}::text[],
        ${chunk.map(() => syncedAt)}::timestamp[]
      )
      ON CONFLICT ("ruc") DO UPDATE SET
        "dv" = EXCLUDED."dv",
        "razonSocial" = EXCLUDED."razonSocial",
        "estado" = EXCLUDED."estado",
        "rucAnterior" = EXCLUDED."rucAnterior",
        "syncedAt" = EXCLUDED."syncedAt"`;
  }
}

export type ZipFetcher = (url: string) => Promise<Uint8Array>;

const defaultFetcher: ZipFetcher = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};

/**
 * Downloads and loads all ten archives. Every archive is parsed and checked
 * BEFORE anything is written, so a bad file never leaves the table half from
 * this month and half from last.
 */
export async function syncPadron(
  opts: { baseUrl?: string; fetcher?: ZipFetcher } = {}
): Promise<{ status: "OK" | "FAILED" | "UNAVAILABLE"; rows: number; rejected: number }> {
  const baseUrl = (opts.baseUrl ?? process.env.PADRON_BASE_URL ?? "").replace(/\/+$/, "");
  if (!baseUrl) {
    await prisma.padronSync.create({
      data: { status: "UNAVAILABLE", finishedAt: new Date(), error: "PADRON_BASE_URL not set" },
    });
    return { status: "UNAVAILABLE", rows: 0, rejected: 0 };
  }
  const fetcher = opts.fetcher ?? defaultFetcher;
  const log = await prisma.padronSync.create({ data: { status: "RUNNING" } });

  try {
    // Pass 1: download and prove every archive. Only the compressed bytes are
    // kept — two million parsed rows at once would not fit a small host.
    const archives: { name: string; bytes: Uint8Array }[] = [];
    for (let d = 0; d <= 9; d++) {
      const name = `ruc${d}.zip`;
      const bytes = await fetcher(`${baseUrl}/${name}`);
      await parsePadronZip(bytes, name); // throws on a wrong format
      archives.push({ name, bytes });
    }
    // Pass 2: load one archive at a time.
    const syncedAt = new Date();
    let rows = 0;
    let rejected = 0;
    for (const a of archives) {
      const f = await parsePadronZip(a.bytes, a.name);
      await upsertRows(f.rows, syncedAt);
      rows += f.rows.length;
      rejected += f.rejected;
    }
    await prisma.padronSync.update({
      where: { id: log.id },
      data: { status: "OK", finishedAt: new Date(), rows, rejectedRows: rejected },
    });
    return { status: "OK", rows, rejected };
  } catch (err) {
    await prisma.padronSync.update({
      where: { id: log.id },
      data: { status: "FAILED", finishedAt: new Date(), error: String(err).slice(0, 2000) },
    });
    return { status: "FAILED", rows: 0, rejected: 0 };
  }
}

export interface SupplierStatus {
  ruc: string;
  dv: string;
  razonSocial: string;
  estado: string;
  active: boolean;
  syncedAt: Date;
}

/** Looks many RUCs up in one query. Unknown RUCs are simply absent. */
export async function lookupSuppliers(
  rucs: readonly (string | null | undefined)[]
): Promise<Map<string, SupplierStatus>> {
  const keys = [...new Set(rucs.map(normalizeRuc).filter(Boolean))];
  const map = new Map<string, SupplierStatus>();
  if (keys.length === 0) return map;
  const rows = await prisma.dnitPadron.findMany({ where: { ruc: { in: keys } } });
  for (const r of rows) map.set(r.ruc, { ...r, active: isActiveEstado(r.estado) });
  return map;
}

export async function latestSuccessfulSync() {
  return prisma.padronSync.findFirst({
    where: { status: "OK" },
    orderBy: { startedAt: "desc" },
  });
}

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Pure: should the cron enqueue a sync now? Monthly after a success; at most
 * daily after any attempt, so a broken download does not hammer DNIT.
 */
export function padronSyncDue(input: {
  configured: boolean;
  lastOkAt: Date | null;
  lastAttemptAt: Date | null;
  pending: boolean;
  now: Date;
}): boolean {
  if (!input.configured || input.pending) return false;
  if (input.lastAttemptAt && input.now.getTime() - input.lastAttemptAt.getTime() < DAY_MS) {
    return false;
  }
  return !input.lastOkAt || input.now.getTime() - input.lastOkAt.getTime() >= MONTH_MS;
}

/** Called from /api/cron. */
export async function enqueuePadronSyncIfDue(now = new Date()): Promise<void> {
  const [lastOk, lastAttempt, pending] = await Promise.all([
    latestSuccessfulSync(),
    prisma.padronSync.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.jobQueue.findFirst({
      where: { type: "padron_sync", status: { in: ["PENDING", "RUNNING"] } },
    }),
  ]);
  const due = padronSyncDue({
    configured: Boolean(process.env.PADRON_BASE_URL),
    lastOkAt: lastOk?.startedAt ?? null,
    lastAttemptAt: lastAttempt?.startedAt ?? null,
    pending: Boolean(pending),
    now,
  });
  if (due) await enqueueJob("padron_sync", {}, { maxAttempts: 1 });
}
