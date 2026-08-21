import { NextResponse } from "next/server";
import forge from "node-forge";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { allowed } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getCompanyId } from "@/lib/company";
import { encrypt } from "@/lib/crypto";
import { saveFile } from "@/lib/storage";
import { audit } from "@/lib/audit";

/**
 * Uploads and stores the .p12 certificate ENCRYPTED at rest (AES-256-GCM),
 * along with its password (also encrypted). Verifies the password by
 * parsing the PKCS#12 with node-forge and extracts the expiry date.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await allowed("settings:write"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const companyId = await getCompanyId();

  const form = await req.formData();
  const file = form.get("file");
  const password = String(form.get("password") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "no_password" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());

  // Verify password + read expiry with node-forge (no JDK required).
  let expiresAt: Date | null = null;
  try {
    const p12Asn1 = forge.asn1.fromDer(buffer.toString("binary"));
    const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, password);
    for (const sc of p12.safeContents) {
      for (const bag of sc.safeBags) {
        if (bag.cert) {
          expiresAt = bag.cert.validity.notAfter;
          break;
        }
      }
      if (expiresAt) break;
    }
  } catch {
    return NextResponse.json({ error: "bad_password_or_file" }, { status: 400 });
  }

  // Store the .p12 encrypted (never in plaintext).
  const encrypted = encrypt(buffer);
  const certPath = await saveFile("certs", `company-${companyId}.p12.enc`, encrypted);
  const passwordEnc = encrypt(password);

  await prisma.company.update({
    where: { id: companyId },
    data: { certPath, certPasswordEnc: passwordEnc, certExpiresAt: expiresAt },
  });
  await audit("update", "settings", companyId, { section: "certificate" });

  return NextResponse.json({ ok: true, expiresAt });
}
