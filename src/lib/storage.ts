import fs from "fs";
import path from "path";

/**
 * Local-disk storage under STORAGE_DIR (default ./storage).
 * Tax documents (xml, kude) are NEVER deleted — 5-year legal retention.
 */
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || "./storage");

// "filings" holds DNIT acknowledgement/receipt PDFs for closed periods. Like
// xml and kude it is a tax document bucket: written once, never deleted.
export const STORAGE_SUBDIRS = [
  "xml",
  "kude",
  "receipts",
  "exports",
  "certs",
  "logos",
  "filings",
] as const;
export type StorageSubdir = (typeof STORAGE_SUBDIRS)[number];

export function storageRoot(): string {
  return STORAGE_DIR;
}

export function storageDir(subdir: StorageSubdir): string {
  const dir = path.join(STORAGE_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function storagePath(subdir: StorageSubdir, filename: string): string {
  // Prevent path traversal from user-influenced names.
  const safe = path.basename(filename);
  return path.join(storageDir(subdir), safe);
}

export async function saveFile(
  subdir: StorageSubdir,
  filename: string,
  content: Buffer | string
): Promise<string> {
  const full = storagePath(subdir, filename);
  await fs.promises.writeFile(full, content);
  return full;
}

export async function readFile(fullPath: string): Promise<Buffer> {
  // Only allow reads inside the storage root.
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(STORAGE_DIR + path.sep)) {
    throw new Error("Path outside storage dir");
  }
  return fs.promises.readFile(resolved);
}

export function ensureStorageDirs(): void {
  for (const sub of STORAGE_SUBDIRS) storageDir(sub);
}
