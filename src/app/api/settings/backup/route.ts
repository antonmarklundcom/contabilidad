import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { allowed } from "@/lib/authz";
import { createBackup } from "@/lib/backup";
import { storageDir } from "@/lib/storage";
import { audit } from "@/lib/audit";

export const maxDuration = 120;

/** Generates a backup now and streams it back as a download. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await allowed("settings:write"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
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
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const name = new URL(req.url).searchParams.get("name");
  if (!name || !/^backup-[\w-]+\.zip$/.test(name)) {
    return NextResponse.json({ error: "bad_name" }, { status: 400 });
  }
  const full = path.join(storageDir("exports"), name);
  if (!fs.existsSync(full)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const data = await fs.promises.readFile(full);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
    },
  });
}
