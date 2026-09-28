import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { allowed } from "@/lib/authz";
import { createBackup, currentBackupAccess } from "@/lib/backup";
import { storageDir } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const maxDuration = 120;

/**
 * Both methods hand out the whole instance, so both need the capability AND a
 * single-tenant instance (see `instanceBackupAccess`). The middleware also
 * gates /api/settings, but the route check is the boundary, not the middleware.
 */
async function guard(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await allowed("settings:write"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if ((await currentBackupAccess()) !== "ok") {
    await audit("denied", "backup", undefined, { reason: "multi_tenant" });
    return NextResponse.json({ error: "multi_tenant" }, { status: 403 });
  }
  return null;
}

/** Generates a backup now and streams it back as a download. */
export async function POST() {
  const denied = await guard();
  if (denied) return denied;
  const zipPath = await createBackup();
  await audit("create", "backup", undefined, { manual: true });
  const data = await fs.promises.readFile(zipPath);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${path.basename(zipPath)}"`,
    },
  });
}

/** Downloads an existing backup by name. */
export async function GET(req: Request) {
  const denied = await guard();
  if (denied) return denied;
  const name = new URL(req.url).searchParams.get("name");
  if (!name || !/^backup-[\w-]+\.zip$/.test(name)) {
    return NextResponse.json({ error: "bad_name" }, { status: 400 });
  }
  const full = path.join(storageDir("exports"), name);
  if (!fs.existsSync(full)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const data = await fs.promises.readFile(full);
  await audit("download", "backup", undefined, { name });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
