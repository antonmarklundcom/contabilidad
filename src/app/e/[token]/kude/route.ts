import { NextResponse } from "next/server";
import fs from "fs";
import { prisma } from "@/lib/prisma";
import { loadLink } from "@/lib/invoice-link";

/**
 * The KuDE of the invoice a one-time link produced (PLAN Phase 8.1).
 *
 * Public, like the page it sits under, and gated by exactly the same thing:
 * holding the token. It serves ONE document — the one `InvoiceLink.invoiceId`
 * points at — so the token cannot be walked into the company's other
 * invoices. There is no id in the URL to tamper with.
 *
 * Deliberately still served after the link expires. Expiry gates EMISSION;
 * once the document exists, withholding its own copy from the person who
 * created it helps nobody, and they already held the token when it was live.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const loaded = await loadLink(token);
  if (!loaded?.link.invoiceId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id: loaded.link.invoiceId, companyId: loaded.link.companyId },
  });
  if (!invoice?.kudePath || !fs.existsSync(invoice.kudePath)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const data = await fs.promises.readFile(invoice.kudePath);
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="KuDE-${invoice.fullNumber ?? invoice.id}.pdf"`,
      // A fiscal document behind a capability URL has no business in a
      // shared cache or a search index.
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
