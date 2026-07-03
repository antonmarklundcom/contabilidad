/**
 * Seed: admin user (from env) + clearly-labeled DEMO data so the UI is
 * browsable immediately. Every demo record says "demo" — nothing pretends
 * to be real. Safe to re-run (idempotent-ish: skips if demo company exists).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { calcularDigitoVerificador } from "../src/lib/sifen/ruc";
import { buildCdc, randomSecurityCode } from "../src/lib/sifen/cdc";
import { computeInvoiceTotals, computeLineAmounts } from "../src/lib/money";
import {
  findDepartamento,
  findDistrito,
  findCiudad,
} from "../src/lib/sifen/catalogs";

const prisma = new PrismaClient();

const dv = (ruc: string) => String(calcularDigitoVerificador(ruc));

const EXPENSE_CATEGORIES: { code: string; nameEs: string; nameEn: string }[] = [
  { code: "MERC", nameEs: "Mercaderías / Insumos", nameEn: "Goods / Supplies" },
  { code: "SERV", nameEs: "Servicios profesionales", nameEn: "Professional services" },
  { code: "ALQU", nameEs: "Alquileres", nameEn: "Rent" },
  { code: "PUBL", nameEs: "Servicios públicos (ANDE, ESSAP)", nameEn: "Utilities (power, water)" },
  { code: "TELE", nameEs: "Telefonía e internet", nameEn: "Phone & internet" },
  { code: "COMB", nameEs: "Combustibles", nameEn: "Fuel" },
  { code: "PAPE", nameEs: "Papelería y útiles", nameEn: "Stationery & office supplies" },
  { code: "INFO", nameEs: "Informática y software", nameEn: "IT & software" },
  { code: "MANT", nameEs: "Mantenimiento y reparaciones", nameEn: "Maintenance & repairs" },
  { code: "TRAN", nameEs: "Transporte y fletes", nameEn: "Transport & freight" },
  { code: "MARK", nameEs: "Publicidad y marketing", nameEn: "Advertising & marketing" },
  { code: "IMPU", nameEs: "Impuestos y tasas", nameEn: "Taxes & fees" },
  { code: "BANC", nameEs: "Gastos bancarios", nameEn: "Bank charges" },
  { code: "OTRO", nameEs: "Otros gastos", nameEn: "Other expenses" },
];

async function main() {
  // ── Admin user ─────────────────────────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "change-me";
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const existingCompany = await prisma.company.findFirst();
  if (existingCompany) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: {},
      create: {
        email: adminEmail,
        passwordHash,
        name: "Admin",
        companyId: existingCompany.id,
      },
    });
    console.log("Company already exists — only ensured admin user. Done.");
    return;
  }

  // ── Demo company (obviously fake RUC + labels) ─────────────────────────
  const depto = findDepartamento("CAPITAL") ?? { codigo: 1, descripcion: "CAPITAL" };
  const distrito =
    findDistrito("ASUNCION", Number(depto.codigo)) ??
    ({ codigo: 1, descripcion: "ASUNCION (DISTRITO)", departamento: 1 } as const);
  const ciudad =
    findCiudad("ASUNCION", Number(distrito.codigo)) ??
    ({ codigo: 1, descripcion: "ASUNCION (DISTRITO)", distrito: 1 } as const);

  const companyRuc = "80000000";
  const company = await prisma.company.create({
    data: {
      ruc: companyRuc,
      dv: dv(companyRuc),
      razonSocial: "EMPRESA DEMO S.A. (datos de prueba)",
      nombreFantasia: "Empresa Demo",
      actividades: [
        { codigo: "62010", descripcion: "Desarrollo de software (demo)" },
      ],
      timbradoNumero: "12345678",
      timbradoFechaInicio: monthsAgo(5),
      tipoContribuyente: 2,
      tipoRegimen: 8,
      direccion: "Avda. Demo c/ Calle Ficticia",
      numeroCasa: "123",
      departamento: Number(depto.codigo),
      departamentoDescripcion: depto.descripcion,
      distrito: Number(distrito.codigo),
      distritoDescripcion: distrito.descripcion,
      ciudad: Number(ciudad.codigo),
      ciudadDescripcion: ciudad.descripcion,
      telefono: "021-000-000",
      email: "demo@empresa-demo.example",
    },
  });

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { companyId: company.id },
    create: {
      email: adminEmail,
      passwordHash,
      name: "Admin",
      companyId: company.id,
    },
  });

  const est = await prisma.establishment.create({
    data: {
      companyId: company.id,
      codigo: "001",
      denominacion: "Casa matriz (demo)",
      direccion: "Avda. Demo c/ Calle Ficticia",
      numeroCasa: "123",
      departamento: Number(depto.codigo),
      departamentoDescripcion: depto.descripcion,
      distrito: Number(distrito.codigo),
      distritoDescripcion: distrito.descripcion,
      ciudad: Number(ciudad.codigo),
      ciudadDescripcion: ciudad.descripcion,
      telefono: "021-000-000",
      email: "demo@empresa-demo.example",
    },
  });

  const punto = await prisma.expeditionPoint.create({
    data: { companyId: company.id, establishmentId: est.id, codigo: "001" },
  });

  // ── Expense categories ────────────────────────────────────────────────
  const categories = await Promise.all(
    EXPENSE_CATEGORIES.map((c) =>
      prisma.expenseCategory.create({ data: { companyId: company.id, ...c } })
    )
  );
  const cat = (code: string) => categories.find((c) => c.code === code)!.id;

  // ── Clients ───────────────────────────────────────────────────────────
  const clientDefs = [
    {
      docType: "RUC" as const,
      ruc: "80011111",
      razonSocial: "Cliente Demo Uno S.R.L.",
      email: "cliente1@demo.example",
      telefono: "021-111-111",
      direccion: "Calle Demo 1, Asunción",
      isTaxpayer: true,
      tipoContribuyente: 2,
    },
    {
      docType: "RUC" as const,
      ruc: "80022222",
      razonSocial: "Comercial Demo Dos S.A.",
      email: "cliente2@demo.example",
      telefono: "021-222-222",
      direccion: "Avda. Demo 2, Asunción",
      isTaxpayer: true,
      tipoContribuyente: 2,
    },
    {
      docType: "RUC" as const,
      ruc: "3333333",
      razonSocial: "Juan Pérez (demo)",
      email: "juan.demo@example.com",
      telefono: "0981-333-333",
      direccion: "Barrio Demo, Luque",
      isTaxpayer: true,
      tipoContribuyente: 1,
    },
    {
      docType: "CI" as const,
      documentoNumero: "4444444",
      razonSocial: "María González (demo, consumidor final)",
      email: "maria.demo@example.com",
      telefono: "0982-444-444",
      isTaxpayer: false,
    },
    {
      docType: "INNOMINADO" as const,
      razonSocial: "Sin Nombre",
      isTaxpayer: false,
    },
  ];
  const clients = [] as { id: string }[];
  for (const c of clientDefs) {
    clients.push(
      await prisma.client.create({
        data: {
          companyId: company.id,
          docType: c.docType,
          ruc: "ruc" in c ? c.ruc : null,
          dv: "ruc" in c && c.ruc ? dv(c.ruc) : null,
          documentoNumero: "documentoNumero" in c ? c.documentoNumero : null,
          razonSocial: c.razonSocial,
          email: c.email ?? null,
          telefono: c.telefono ?? null,
          direccion: c.direccion ?? null,
          isTaxpayer: c.isTaxpayer,
          tipoContribuyente: c.tipoContribuyente ?? null,
        },
      })
    );
  }

  // ── Products ──────────────────────────────────────────────────────────
  const productDefs: {
    codigo: string;
    es: string;
    en: string;
    precio: number;
    iva: "IVA_10" | "IVA_5" | "EXENTA";
    tipo: "PRODUCTO" | "SERVICIO";
    moneda?: string;
  }[] = [
    { codigo: "SERV-001", es: "Desarrollo de software (hora, demo)", en: "Software development (hour, demo)", precio: 250000, iva: "IVA_10", tipo: "SERVICIO" },
    { codigo: "SERV-002", es: "Mantenimiento mensual de sistema (demo)", en: "Monthly system maintenance (demo)", precio: 1500000, iva: "IVA_10", tipo: "SERVICIO" },
    { codigo: "SERV-003", es: "Consultoría técnica (hora, demo)", en: "Technical consulting (hour, demo)", precio: 300000, iva: "IVA_10", tipo: "SERVICIO" },
    { codigo: "PROD-001", es: "Notebook 14\" (demo)", en: "14\" laptop (demo)", precio: 4500000, iva: "IVA_10", tipo: "PRODUCTO" },
    { codigo: "PROD-002", es: "Mouse inalámbrico (demo)", en: "Wireless mouse (demo)", precio: 120000, iva: "IVA_10", tipo: "PRODUCTO" },
    { codigo: "PROD-003", es: "Teclado mecánico (demo)", en: "Mechanical keyboard (demo)", precio: 350000, iva: "IVA_10", tipo: "PRODUCTO" },
    { codigo: "PROD-004", es: "Arroz 1kg (demo, IVA 5%)", en: "Rice 1kg (demo, 5% VAT)", precio: 8000, iva: "IVA_5", tipo: "PRODUCTO" },
    { codigo: "PROD-005", es: "Yerba mate 500g (demo, IVA 5%)", en: "Yerba mate 500g (demo, 5% VAT)", precio: 15000, iva: "IVA_5", tipo: "PRODUCTO" },
    { codigo: "PROD-006", es: "Libro técnico (demo, exenta)", en: "Technical book (demo, exempt)", precio: 200000, iva: "EXENTA", tipo: "PRODUCTO" },
    { codigo: "SERV-004", es: "Hosting anual (demo, USD)", en: "Yearly hosting (demo, USD)", precio: 120, iva: "IVA_10", tipo: "SERVICIO", moneda: "USD" },
  ];
  const products = [] as Awaited<ReturnType<typeof prisma.product.create>>[];
  for (const p of productDefs) {
    products.push(
      await prisma.product.create({
        data: {
          companyId: company.id,
          codigo: p.codigo,
          descripcionEs: p.es,
          descripcionEn: p.en,
          precioUnitario: p.precio,
          moneda: p.moneda ?? "PYG",
          ivaRate: p.iva,
          tipo: p.tipo,
        },
      })
    );
  }

  // ── Invoices (15, mixed statuses) ─────────────────────────────────────
  type Status =
    | "DRAFT"
    | "QUEUED"
    | "SENT"
    | "APPROVED"
    | "REJECTED"
    | "CANCELLED"
    | "CONTINGENCY";
  const statuses: Status[] = [
    "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED",
    "SENT", "SENT",
    "REJECTED", "REJECTED",
    "CANCELLED",
    "CONTINGENCY",
    "DRAFT", "DRAFT",
  ];

  let numero = 0;
  for (let i = 0; i < statuses.length; i++) {
    const status = statuses[i];
    const client = clients[i % clients.length];
    const issueDate = daysAgo(45 - i * 3);
    const isDraft = status === "DRAFT";
    if (!isDraft) numero += 1;
    const num = isDraft ? null : String(numero).padStart(7, "0");

    // 1–3 lines per invoice from the PYG products
    const lineProducts = [
      products[i % 9],
      products[(i + 3) % 9],
      ...(i % 3 === 0 ? [products[(i + 5) % 9]] : []),
    ];
    const lines = lineProducts.map((p, idx) => ({
      productId: p.id,
      orden: idx + 1,
      codigo: p.codigo,
      descripcion: p.descripcionEs,
      cantidad: (i % 3) + 1,
      precioUnitario: Number(p.precioUnitario),
      descuento: 0,
      iva: p.ivaRate === "IVA_10" ? 10 : p.ivaRate === "IVA_5" ? 5 : 0,
      ivaTipo: p.ivaRate === "EXENTA" ? 3 : 1,
      ivaProporcion: 100,
    }));
    const totals = computeInvoiceTotals(lines, "PYG");

    const securityCode = randomSecurityCode();
    const approvedLike = status === "APPROVED" || status === "CANCELLED";
    const cdc =
      approvedLike && num
        ? buildCdc({
            tipoDocumento: 1,
            ruc: companyRuc,
            dv: dv(companyRuc),
            establecimiento: "001",
            punto: "001",
            numero: num,
            tipoContribuyente: 2,
            fecha: issueDate,
            tipoEmision: status === "CONTINGENCY" ? 2 : 1,
            codigoSeguridad: securityCode,
          })
        : null;

    await prisma.invoice.create({
      data: {
        companyId: company.id,
        clientId: client.id,
        tipoDocumento: 1,
        status,
        cdc,
        establecimiento: "001",
        punto: "001",
        numero: num,
        fullNumber: num ? `001-001-${num}` : null,
        securityCode: isDraft ? null : securityCode,
        issueDate,
        moneda: "PYG",
        condicionVenta: i % 4 === 0 ? 2 : 1,
        creditPlazo: i % 4 === 0 ? "30 días" : null,
        descripcion: "Factura de demostración — sin valor fiscal",
        totalGravada10: totals.gravada10,
        totalGravada5: totals.gravada5,
        totalExenta: totals.exenta,
        totalIva10: totals.iva10,
        totalIva5: totals.iva5,
        totalIva: totals.totalIva,
        totalDescuento: totals.totalDescuento,
        total: totals.total,
        sifenEstado: status === "APPROVED" ? "Aprobado" : status === "REJECTED" ? "Rechazado" : null,
        sifenCodigoRespuesta: status === "APPROVED" ? "0260" : status === "REJECTED" ? (i % 2 === 0 ? "0420" : "1101") : null,
        sifenMensaje:
          status === "APPROVED"
            ? "Autorización del DE satisfactoria (demo)"
            : status === "REJECTED"
              ? "Rechazo simulado para datos de prueba"
              : null,
        emittedAt: isDraft ? null : issueDate,
        sentAt: isDraft ? null : issueDate,
        approvedAt: approvedLike ? issueDate : null,
        rejectedAt: status === "REJECTED" ? issueDate : null,
        contingencyAt: status === "CONTINGENCY" ? issueDate : null,
        cancelledAt: status === "CANCELLED" ? new Date(issueDate.getTime() + 3600e3) : null,
        cancelReason: status === "CANCELLED" ? "Anulación de prueba (demo)" : null,
        lines: { create: lines },
      },
    });
  }

  await prisma.documentSequence.create({
    data: {
      companyId: company.id,
      expeditionPointId: punto.id,
      tipoDocumento: 1,
      currentNumber: numero,
    },
  });
  await prisma.documentSequence.createMany({
    data: [5, 6].map((t) => ({
      companyId: company.id,
      expeditionPointId: punto.id,
      tipoDocumento: t,
      currentNumber: 0,
    })),
  });

  // ── Expenses ──────────────────────────────────────────────────────────
  const supplierDefs = [
    { ruc: "80055555", name: "Proveedor Demo Insumos S.A.", cat: "MERC" },
    { ruc: "80066666", name: "Estación Demo Combustibles S.R.L.", cat: "COMB" },
    { ruc: "80077777", name: "Telefonía Demo S.A.", cat: "TELE" },
    { ruc: "80088888", name: "Inmobiliaria Demo S.A.", cat: "ALQU" },
    { ruc: "80099999", name: "Ferretería Demo S.R.L.", cat: "MANT" },
  ];
  for (let i = 0; i < 10; i++) {
    const s = supplierDefs[i % supplierDefs.length];
    const g10 = [150000, 320000, 90000, 1200000, 75000][i % 5] + i * 1000;
    const iva10 = Math.round(g10 * 0.1);
    const total = g10 + iva10;
    await prisma.expense.create({
      data: {
        companyId: company.id,
        source: i % 3 === 0 ? "PHOTO" : "MANUAL",
        status: i < 7 ? "CONFIRMED" : "NEEDS_REVIEW",
        supplierRuc: s.ruc,
        supplierDv: dv(s.ruc),
        supplierRazonSocial: s.name,
        timbrado: "87654321",
        tipoComprobante: "FACTURA",
        numeroComprobante: `001-001-${String(1000 + i).padStart(7, "0")}`,
        fecha: daysAgo(40 - i * 4),
        gravada10: g10,
        iva10,
        total,
        moneda: "PYG",
        categoryId: i < 7 ? cat(s.cat) : null,
        notes: "Gasto de demostración (demo)",
        confidence:
          i >= 7
            ? { supplierRuc: 0.95, total: 0.65, fecha: 0.7, numeroComprobante: 0.9 }
            : undefined,
      },
    });
    if (i < supplierDefs.length) {
      await prisma.supplierCategoryMap.upsert({
        where: { companyId_supplierRuc: { companyId: company.id, supplierRuc: s.ruc } },
        update: {},
        create: { companyId: company.id, supplierRuc: s.ruc, categoryId: cat(s.cat) },
      });
    }
  }

  console.log("Seed complete:");
  console.log(`  Company: ${company.razonSocial} RUC ${company.ruc}-${company.dv}`);
  console.log(`  Admin:   ${adminEmail}`);
  console.log(`  ${clients.length} clients, ${products.length} products, 15 invoices, 10 expenses`);
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(10, 30, 0, 0);
  return d;
}

function monthsAgo(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
