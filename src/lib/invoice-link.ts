/**
 * One-time invoice links (PLAN Phase 8.1).
 *
 * A signed, short-lived, single-use URL that lets someone emit exactly ONE
 * invoice without a login — `/e/[token]`. Small on purpose: it is the whole
 * of Phase 8.1, and none of Phase 8.2's WhatsApp intake.
 *
 * ## The security shape, and why
 *
 * **The token is never stored.** The database holds `HMAC-SHA256(token)` under
 * a server-side key, exactly as a password-reset token is handled. Two
 * consequences: a *read* of `InvoiceLink` yields nothing anyone can redeem,
 * and a *write* to it cannot forge a working link either, because minting a
 * row for a chosen token needs the key. The raw token exists once, in the URL
 * handed to the user; we cannot show it again, and the UI says so.
 *
 * **Expiry is server-side only.** It lives in `InvoiceLink.expiresAt` and is
 * compared against the server's clock. The token carries no readable payload —
 * it is opaque randomness — so there is nothing in it for a client to edit,
 * and nothing about the deadline that the client is trusted to report. This is
 * the deliberate difference from a self-describing JWT.
 *
 * **Single use is a claim, not a check.** `claimLink` flips `usedAt` with a
 * conditional `updateMany`, so two concurrent redemptions of the same token
 * produce one winner and one refusal at the database, not a race. The claim
 * happens BEFORE the invoice is emitted: a burned link that emitted nothing
 * is a nuisance, while two DTEs from one link would burn two sequence numbers
 * and put a duplicate document into SIFEN. The claim is never released, and
 * that is the trade deliberately taken.
 *
 * **The scope is pinned at issue time.** Company, document type and expedition
 * point come off the stored row; the redeemer chooses only the buyer and the
 * lines. Nothing the anonymous form posts decides who is invoicing.
 */
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import type { InvoiceLink } from "@prisma/client";

/** How long a link lives when `INVOICE_LINK_TTL_MINUTES` says nothing. */
export const DEFAULT_TTL_MINUTES = 30;
/** Floor and ceiling on the configured TTL. "Short-lived" is not negotiable
 *  by environment variable — a typo must not mint a month-long link. */
export const MIN_TTL_MINUTES = 5;
export const MAX_TTL_MINUTES = 24 * 60;

/** Bytes of entropy in a token. 32 bytes ⇒ 43 base64url characters. */
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * The configured link lifetime, in minutes.
 *
 * Pure so the clamping is testable. Anything unparseable falls back to the
 * default rather than to "no expiry" — a misconfiguration must fail towards
 * the safer link, never away from it.
 */
export function resolveTtlMinutes(raw: string | undefined | null): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_MINUTES;
  return Math.min(MAX_TTL_MINUTES, Math.max(MIN_TTL_MINUTES, Math.round(parsed)));
}

/** The deployment's configured link lifetime, for the UI's copy. */
export function configuredTtlMinutes(): number {
  return resolveTtlMinutes(process.env.INVOICE_LINK_TTL_MINUTES);
}

/** The expiry instant for a link minted at `from`. */
export function expiryFrom(from: Date, ttlMinutes: number): Date {
  return new Date(from.getTime() + ttlMinutes * 60_000);
}

/**
 * The key the token HMAC is taken under.
 *
 * `INVOICE_LINK_SECRET` when set, otherwise `NEXTAUTH_SECRET`, which every
 * deployment already has. Throwing on neither is deliberate: silently falling
 * back to a constant would make every install's hashes forgeable.
 */
function signingKey(): string {
  const key = process.env.INVOICE_LINK_SECRET || process.env.NEXTAUTH_SECRET;
  if (!key) {
    throw new Error(
      "INVOICE_LINK_SECRET or NEXTAUTH_SECRET must be set to issue one-time invoice links"
    );
  }
  return key;
}

/** A fresh token. URL-safe, opaque, and carrying no readable claims. */
export function generateLinkToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Cheap shape check before touching the database.
 *
 * Not a security boundary — `hashLinkToken` is — but it turns the flood of
 * junk any public URL attracts into a rejection with no query behind it.
 */
export function linkTokenLooksValid(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}

/** The stored form of a token. */
export function hashLinkToken(token: string): string {
  return createHmac("sha256", signingKey()).update(token).digest("hex");
}

/**
 * Constant-time comparison of two stored hashes.
 *
 * The lookup itself is by unique index, so this is belt-and-braces for
 * callers that compare a recomputed hash against a fetched one.
 */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export interface CreateInvoiceLinkInput {
  companyId: string;
  establecimiento: string;
  punto: string;
  moneda?: string;
  note?: string | null;
  createdBy?: string | null;
  /** Overrides the environment TTL. Clamped the same way. */
  ttlMinutes?: number;
}

export interface CreatedInvoiceLink {
  link: InvoiceLink;
  /**
   * The raw token — the ONLY time it exists outside the URL bar. It is not
   * recoverable afterwards, by us or by anyone with database access.
   */
  token: string;
  /** Path to hand the user, e.g. `/e/AbC…`. The origin is the caller's. */
  path: string;
}

export async function createInvoiceLink(
  input: CreateInvoiceLinkInput,
  now: Date = new Date()
): Promise<CreatedInvoiceLink> {
  const ttl = resolveTtlMinutes(
    input.ttlMinutes !== undefined
      ? String(input.ttlMinutes)
      : process.env.INVOICE_LINK_TTL_MINUTES
  );
  const token = generateLinkToken();
  const link = await prisma.invoiceLink.create({
    data: {
      companyId: input.companyId,
      tokenHash: hashLinkToken(token),
      // Factura only. A nota de crédito needs an original document to
      // reference, which an anonymous form has no business choosing.
      tipoDocumento: 1,
      establecimiento: input.establecimiento,
      punto: input.punto,
      moneda: input.moneda ?? "PYG",
      expiresAt: expiryFrom(now, ttl),
      createdBy: input.createdBy ?? null,
      note: input.note || null,
    },
  });
  return { link, token, path: `/e/${token}` };
}

export type LinkState = "usable" | "expired" | "redeemed";

export interface LoadedLink {
  link: InvoiceLink;
  state: LinkState;
}

/**
 * The link behind a token, with its state — or null when the token matches
 * nothing.
 *
 * A redeemed link is returned rather than hidden: the page shows the document
 * it produced. Emission is what the expiry and the single use gate, and
 * `claimLink` is the only thing that opens that gate.
 */
export async function loadLink(token: string, now: Date = new Date()): Promise<LoadedLink | null> {
  if (!linkTokenLooksValid(token)) return null;
  const link = await prisma.invoiceLink.findUnique({
    where: { tokenHash: hashLinkToken(token) },
  });
  if (!link) return null;
  if (link.usedAt) return { link, state: "redeemed" };
  if (link.expiresAt <= now) return { link, state: "expired" };
  return { link, state: "usable" };
}

export type ClaimResult =
  | { ok: true; link: InvoiceLink }
  | { ok: false; reason: "not_found" | "expired" | "redeemed" };

/**
 * Takes exclusive ownership of a link, atomically.
 *
 * The unused-and-unexpired test lives inside the `updateMany`, so the check
 * and the write are one statement: two concurrent redemptions cannot both
 * pass it. Callers must emit only after this returns `ok`.
 */
export async function claimLink(token: string, now: Date = new Date()): Promise<ClaimResult> {
  const loaded = await loadLink(token, now);
  if (!loaded) return { ok: false, reason: "not_found" };
  if (loaded.state !== "usable") {
    return { ok: false, reason: loaded.state === "expired" ? "expired" : "redeemed" };
  }

  const claimed = await prisma.invoiceLink.updateMany({
    where: { id: loaded.link.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count === 0) {
    // Someone else won the race, or it expired between the read and the write.
    const after = await prisma.invoiceLink.findUnique({ where: { id: loaded.link.id } });
    return { ok: false, reason: after?.usedAt ? "redeemed" : "expired" };
  }

  const link = await prisma.invoiceLink.findUnique({ where: { id: loaded.link.id } });
  return { ok: true, link: link! };
}

/** Records which document a claimed link produced. */
export async function attachInvoiceToLink(linkId: string, invoiceId: string): Promise<void> {
  await prisma.invoiceLink.update({ where: { id: linkId }, data: { invoiceId } });
}
