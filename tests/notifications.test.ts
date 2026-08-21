import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import {
  FILING_THRESHOLDS,
  EXPIRY_THRESHOLDS,
  reminderThreshold,
  reminderSubject,
  plannedReminders,
  enqueueDueReminders,
  reminderRecipients,
} from "@/lib/notifications";
import { getDict, translate } from "@/lib/i18n";

/**
 * PLAN Phase 5.6 — reminder + expiry jobs.
 *
 * The threshold ladder is pure and fixture-tested here; the dedup ("never the
 * same reminder twice") is a database property and runs against a real DB,
 * skipping gracefully without DATABASE_URL like tests/sequence.test.ts.
 */

describe("reminder threshold ladder (pure)", () => {
  it("fires each filing threshold exactly once as the date approaches", () => {
    // The value only *changes* on the days a reminder should go out; the
    // NotificationLog insert turns the repeats into no-ops.
    const ladder = [14, 11, 10, 9, 5, 4, 3, 2, 1, 0, -3].map((d) =>
      reminderThreshold(d, FILING_THRESHOLDS)
    );
    expect(ladder).toEqual([null, null, 10, 10, 10, 10, 3, 3, 1, 1, 1]);
  });

  it("uses the long ladder for timbrado and certificate expiry", () => {
    expect(reminderThreshold(61, EXPIRY_THRESHOLDS)).toBeNull();
    expect(reminderThreshold(60, EXPIRY_THRESHOLDS)).toBe(60);
    expect(reminderThreshold(31, EXPIRY_THRESHOLDS)).toBe(60);
    expect(reminderThreshold(30, EXPIRY_THRESHOLDS)).toBe(30);
    expect(reminderThreshold(7, EXPIRY_THRESHOLDS)).toBe(7);
    expect(reminderThreshold(-1, EXPIRY_THRESHOLDS)).toBe(7);
  });

  it("keys the subject on the thing expiring, so a renewal alerts afresh", () => {
    expect(reminderSubject("timbrado_expiry", "12345678:2027-01-31")).not.toEqual(
      reminderSubject("timbrado_expiry", "12345678:2028-01-31")
    );
  });
});

describe("reminder copy exists in both locales", () => {
  for (const locale of ["es", "en"] as const) {
    for (const kind of ["filing_due", "timbrado_expiry", "cert_expiry"] as const) {
      it(`${locale}/${kind} has a subject and a body`, () => {
        const dict = getDict(locale);
        for (const part of ["subject", "body"]) {
          const key = `notifications.${kind}.${part}`;
          // translate() returns the key itself when the string is missing.
          expect(translate(dict, key)).not.toBe(key);
        }
      });
    }
  }
});

const prisma = new PrismaClient();
let dbAvailable = false;
let companyId = "";

// RUC ending in 4 → perpetual calendar day 15 of the following month.
const RUC = "90000024";

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }
  const company = await prisma.company.create({
    data: {
      ruc: RUC,
      dv: "1",
      razonSocial: "Test Reminders SA",
      email: "avisos@example.com",
      actividades: [],
      timbradoNumero: "12345678",
      timbradoFechaInicio: new Date("2026-01-01"),
      timbradoFechaFin: new Date("2026-09-30"),
      certExpiresAt: new Date("2026-10-20"),
      direccion: "Calle Test 123",
      departamento: 11,
      departamentoDescripcion: "CENTRAL",
      distrito: 1,
      distritoDescripcion: "ASUNCION",
      ciudad: 1,
      ciudadDescripcion: "ASUNCION",
    },
  });
  companyId = company.id;
});

// Each scan test starts from "nothing sent yet".
beforeEach(async () => {
  if (!dbAvailable) return;
  await prisma.notificationLog.deleteMany({ where: { companyId } });
  await prisma.jobQueue.deleteMany({ where: { type: "filing_reminder" } });
});

afterAll(async () => {
  if (dbAvailable && companyId) {
    await prisma.notificationLog.deleteMany({ where: { companyId } });
    await prisma.jobQueue.deleteMany({ where: { type: "filing_reminder" } });
    await prisma.taxFiling.deleteMany({ where: { companyId } });
    await prisma.user.deleteMany({ where: { companyId } });
    await prisma.company.delete({ where: { id: companyId } });
  }
  await prisma.$disconnect();
});

describe.skipIf(!process.env.DATABASE_URL)("reminder scan (database)", () => {
  it("plans the filing, timbrado and certificate reminders that are in range", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    // 2026-09-05: the 2026-08 filing is due 2026-09-15 (10 days), the timbrado
    // expires in 25 days, the certificate in 45.
    const planned = await plannedReminders(companyId, new Date("2026-09-05T12:00:00Z"));
    const byKind = Object.fromEntries(planned.map((p) => [p.kind, p]));

    expect(byKind.filing_due?.threshold).toBe(10);
    expect(byKind.filing_due?.detail).toBe("2026-08");
    expect(byKind.timbrado_expiry?.threshold).toBe(30);
    expect(byKind.cert_expiry?.threshold).toBe(60);
  });

  it("plans nothing while every date is still beyond its widest threshold", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    // 2026-06-20: the next IVA period (2026-06) is due 2026-07-15, 25 days
    // out; the timbrado expires in 102 days and the certificate in 122. All
    // three are beyond their widest threshold, so nothing is planned.
    const planned = await plannedReminders(companyId, new Date("2026-06-20T12:00:00Z"));
    expect(planned).toEqual([]);
  });

  it("no-ops cleanly and logs nothing when SMTP is unconfigured", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    const previous = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;
    try {
      const res = await enqueueDueReminders(new Date("2026-09-05T12:00:00Z"));
      expect(res).toEqual({ enqueued: 0, skipped: "no_smtp" });
      // Nothing marked as sent, so reminders start flowing once SMTP exists.
      expect(await prisma.notificationLog.count({ where: { companyId } })).toBe(0);
    } finally {
      if (previous === undefined) delete process.env.SMTP_HOST;
      else process.env.SMTP_HOST = previous;
    }
  });

  it("queues each reminder once, however often the cron fires", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_FROM = "no-reply@example.com";
    try {
      const now = new Date("2026-09-05T12:00:00Z");
      const first = await enqueueDueReminders(now);
      expect(first.enqueued).toBe(3);

      const second = await enqueueDueReminders(now);
      expect(second.enqueued).toBe(0);

      expect(await prisma.jobQueue.count({ where: { type: "filing_reminder" } })).toBe(3);
      expect(await prisma.notificationLog.count({ where: { companyId } })).toBe(3);

      // A later day inside the same threshold step is still the same reminder.
      const sameStep = await enqueueDueReminders(new Date("2026-09-09T12:00:00Z"));
      expect(sameStep.enqueued).toBe(0);

      // Crossing into the next step is a new reminder.
      const nextStep = await enqueueDueReminders(new Date("2026-09-12T12:00:00Z"));
      expect(nextStep.enqueued).toBe(1);
      const filingLogs = await prisma.notificationLog.findMany({
        where: { companyId, kind: "filing_due" },
        orderBy: { threshold: "desc" },
      });
      expect(filingLogs.map((l) => l.threshold)).toEqual([10, 3]);
    } finally {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_FROM;
    }
  });

  it("skips a period the taxpayer already submitted", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await prisma.taxFiling.create({
      data: {
        companyId,
        type: "IVA",
        year: 2026,
        month: 8,
        status: "SUBMITTED",
        dueDate: new Date("2026-09-15"),
        snapshot: {},
        submittedAt: new Date("2026-09-02"),
      },
    });
    try {
      const planned = await plannedReminders(companyId, new Date("2026-09-05T12:00:00Z"));
      // The next period (2026-09) is not due yet, so no filing reminder at all.
      expect(planned.some((p) => p.kind === "filing_due")).toBe(false);
    } finally {
      await prisma.taxFiling.deleteMany({ where: { companyId } });
    }
  });

  it("addresses the company plus its admin/accountant users, never clients", async (ctx) => {
    if (!dbAvailable) ctx.skip();

    await prisma.user.createMany({
      data: [
        { companyId, email: "conta@example.com", passwordHash: "x", name: "Conta", role: "accountant" },
        { companyId, email: "cliente@example.com", passwordHash: "x", name: "Cliente", role: "client" },
      ],
    });
    try {
      const to = await reminderRecipients(companyId);
      expect(to).toContain("avisos@example.com");
      expect(to).toContain("conta@example.com");
      expect(to).not.toContain("cliente@example.com");
    } finally {
      await prisma.user.deleteMany({ where: { companyId } });
    }
  });
});
