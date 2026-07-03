import crypto from "crypto";

/**
 * AES-256-GCM encryption at rest for the .p12 certificate and its password.
 * ENCRYPTION_KEY must be 64 hex chars (32 bytes).
 */
function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error(
      "ENCRYPTION_KEY must be 64 hex characters (generate with: openssl rand -hex 32)"
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(plain: Buffer | string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const data = Buffer.concat([
    cipher.update(typeof plain === "string" ? Buffer.from(plain, "utf8") : plain),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

export function decrypt(payload: string): Buffer {
  const [v, ivB64, tagB64, dataB64] = payload.split(":");
  if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) throw new Error("Malformed encrypted payload");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
}

export function decryptToString(payload: string): string {
  return decrypt(payload).toString("utf8");
}
