/**
 * Backups: nightly job dumps the database and zips /storage into
 * storage/exports/backup-YYYY-MM-DD-HHmm.zip, keeping the last 14.
 */
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { ZipArchive } from "archiver";
import { prisma } from "@/lib/prisma";
import { storageDir, storageRoot } from "@/lib/storage";
import { enqueueJob } from "@/lib/jobs/queue";

const KEEP = 14;

export async function createBackup(): Promise<string> {
  const exportsDir = storageDir("exports");
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const zipPath = path.join(exportsDir, `backup-${stamp}.zip`);

  const dbDump = await dumpDatabase();

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: 6 } });
    output.on("close", () => resolve());
    archive.on("error", reject);
    archive.pipe(output);
    archive.append(dbDump.content, { name: dbDump.filename });
    for (const sub of ["xml", "kude", "receipts", "certs", "logos"] as const) {
      const dir = path.join(storageRoot(), sub);
      if (fs.existsSync(dir)) archive.directory(dir, sub);
    }
    void archive.finalize();
  });

  // Retention: keep the newest KEEP backups.
  const backups = fs
    .readdirSync(exportsDir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".zip"))
    .sort()
    .reverse();
  for (const old of backups.slice(KEEP)) {
    fs.unlinkSync(path.join(exportsDir, old));
  }
  return zipPath;
}

/**
 * Prefers the native dump tool (pg_dump / mysqldump). Falls back to a JSON
 * export of every table via Prisma when the binary is unavailable (common
 * on shared hosts).
 */
async function dumpDatabase(): Promise<{ filename: string; content: Buffer }> {
  const url = process.env.DATABASE_URL || "";
  try {
    if (url.startsWith("postgres")) {
      const out = await run("pg_dump", ["--dbname", url, "--no-owner", "--format", "plain"]);
      return { filename: "database.sql", content: out };
    }
    if (url.startsWith("mysql")) {
      const u = new URL(url);
      const args = [
        `--host=${u.hostname}`,
        `--port=${u.port || "3306"}`,
        `--user=${decodeURIComponent(u.username)}`,
        `--password=${decodeURIComponent(u.password)}`,
        u.pathname.replace(/^\//, ""),
      ];
      const out = await run("mysqldump", args);
      return { filename: "database.sql", content: out };
    }
  } catch (err) {
    console.warn("native db dump failed, falling back to JSON export:", err);
  }
  return { filename: "database.json", content: Buffer.from(await jsonExport(), "utf8") };
}

async function jsonExport(): Promise<string> {
  const [
    users, companies, establishments, points, sequences, clients, products,
    invoices, lines, categories, expenses, supplierMaps, jobs, sifenLogs, auditLogs, settings,
  ] = await Promise.all([
    prisma.user.findMany(), prisma.company.findMany(), prisma.establishment.findMany(),
    prisma.expeditionPoint.findMany(), prisma.documentSequence.findMany(),
    prisma.client.findMany(), prisma.product.findMany(),
    prisma.invoice.findMany(), prisma.invoiceLine.findMany(),
    prisma.expenseCategory.findMany(), prisma.expense.findMany(),
    prisma.supplierCategoryMap.findMany(), prisma.jobQueue.findMany(),
    prisma.sifenLog.findMany(), prisma.auditLog.findMany(), prisma.setting.findMany(),
  ]);
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      users, companies, establishments, points, sequences, clients, products,
      invoices, lines, categories, expenses, supplierMaps, jobs, sifenLogs, auditLogs, settings,
    },
    null,
    1
  );
}

function run(cmd: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (c) => chunks.push(c));
    child.stderr.on("data", (c) => errChunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`${cmd} exited ${code}: ${Buffer.concat(errChunks).toString()}`));
    });
  });
}

export function listBackups(): { name: string; size: number; createdAt: Date }[] {
  const exportsDir = storageDir("exports");
  return fs
    .readdirSync(exportsDir)
    .filter((f) => f.startsWith("backup-") && f.endsWith(".zip"))
    .map((name) => {
      const stat = fs.statSync(path.join(exportsDir, name));
      return { name, size: stat.size, createdAt: stat.mtime };
    })
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/** Called from /api/cron: enqueue one backup per calendar day. */
export async function enqueueNightlyBackupIfDue(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const existing = listBackups().some(
    (b) => b.createdAt.toISOString().slice(0, 10) === today
  );
  if (existing) return;
  const pending = await prisma.jobQueue.findFirst({
    where: { type: "backup", status: { in: ["PENDING", "RUNNING"] } },
  });
  if (pending) return;
  await enqueueJob("backup", { reason: "nightly" }, { maxAttempts: 2 });
}
