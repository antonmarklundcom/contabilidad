import { z } from "zod";
import { validarRuc } from "@/lib/sifen/ruc";

export const clientSchema = z
  .object({
    docType: z.enum(["RUC", "CI", "PASAPORTE", "INNOMINADO"]),
    ruc: z.string().trim().regex(/^[0-9]{1,8}$/, "invalid").optional().or(z.literal("")),
    dv: z.string().trim().regex(/^[0-9]$/, "invalid").optional().or(z.literal("")),
    documentoNumero: z.string().trim().max(30).optional().or(z.literal("")),
    razonSocial: z.string().trim().min(1).max(255),
    nombreFantasia: z.string().trim().max(255).optional().or(z.literal("")),
    email: z.string().trim().email().optional().or(z.literal("")),
    telefono: z.string().trim().max(40).optional().or(z.literal("")),
    direccion: z.string().trim().max(255).optional().or(z.literal("")),
    pais: z.string().trim().length(3).default("PRY"),
    paisDescripcion: z.string().trim().max(100).default("Paraguay"),
    isTaxpayer: z.boolean().default(true),
    tipoContribuyente: z.coerce.number().int().min(1).max(2).optional(),
    notes: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .superRefine((val, ctx) => {
    if (val.docType === "RUC") {
      if (!val.ruc) {
        ctx.addIssue({ code: "custom", path: ["ruc"], message: "required" });
      } else if (!val.dv || !validarRuc(val.ruc, val.dv)) {
        ctx.addIssue({ code: "custom", path: ["dv"], message: "dv_mismatch" });
      }
    }
    if ((val.docType === "CI" || val.docType === "PASAPORTE") && !val.documentoNumero) {
      ctx.addIssue({ code: "custom", path: ["documentoNumero"], message: "required" });
    }
  });

export const productSchema = z.object({
  codigo: z.string().trim().min(1).max(50),
  descripcionEs: z.string().trim().min(1).max(255),
  descripcionEn: z.string().trim().max(255).optional().or(z.literal("")),
  unidadMedida: z.coerce.number().int().positive().default(77),
  precioUnitario: z.coerce.number().nonnegative(),
  moneda: z.enum(["PYG", "USD"]).default("PYG"),
  ivaRate: z.enum(["IVA_10", "IVA_5", "EXENTA"]).default("IVA_10"),
  tipo: z.enum(["PRODUCTO", "SERVICIO"]).default("PRODUCTO"),
  active: z.boolean().default(true),
});

export const invoiceLineSchema = z.object({
  productId: z.string().optional().or(z.literal("")),
  codigo: z.string().trim().max(50).optional().or(z.literal("")),
  descripcion: z.string().trim().min(1).max(500),
  unidadMedida: z.coerce.number().int().positive().default(77),
  cantidad: z.coerce.number().positive(),
  precioUnitario: z.coerce.number().positive(),
  descuento: z.coerce.number().nonnegative().default(0),
  iva: z.coerce.number().refine((v) => [10, 5, 0].includes(v)),
});

export const invoiceSchema = z
  .object({
    clientId: z.string().min(1),
    tipoDocumento: z.coerce.number().refine((v) => [1, 5, 6].includes(v)).default(1),
    establecimiento: z.string().regex(/^[0-9]{3}$/),
    punto: z.string().regex(/^[0-9]{3}$/),
    issueDate: z.coerce.date(),
    moneda: z.enum(["PYG", "USD"]).default("PYG"),
    exchangeRate: z.coerce.number().positive().optional(),
    condicionVenta: z.coerce.number().refine((v) => [1, 2].includes(v)).default(1),
    creditPlazo: z.string().trim().max(60).optional().or(z.literal("")),
    creditCuotas: z.coerce.number().int().positive().optional(),
    descripcion: z.string().trim().max(500).optional().or(z.literal("")),
    observacion: z.string().trim().max(3000).optional().or(z.literal("")),
    originalInvoiceId: z.string().optional().or(z.literal("")),
    motivoNota: z.coerce.number().int().positive().optional(),
    lines: z.array(invoiceLineSchema).min(1),
  })
  .superRefine((val, ctx) => {
    if (val.moneda !== "PYG" && !val.exchangeRate) {
      ctx.addIssue({ code: "custom", path: ["exchangeRate"], message: "required" });
    }
    if (val.moneda === "PYG") {
      val.lines.forEach((line, i) => {
        if (!Number.isInteger(line.precioUnitario) || !Number.isInteger(line.descuento)) {
          ctx.addIssue({
            code: "custom",
            path: ["lines", i, "precioUnitario"],
            message: "pyg_no_decimals",
          });
        }
      });
    }
    if ((val.tipoDocumento === 5 || val.tipoDocumento === 6) && !val.originalInvoiceId) {
      ctx.addIssue({ code: "custom", path: ["originalInvoiceId"], message: "required" });
    }
  });

export type ClientInput = z.infer<typeof clientSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type InvoiceInput = z.infer<typeof invoiceSchema>;
export type InvoiceLineInput = z.infer<typeof invoiceLineSchema>;

export const expenseSchema = z.object({
  supplierRuc: z.string().trim().regex(/^[0-9]{1,8}$/).optional().or(z.literal("")),
  supplierDv: z.string().trim().regex(/^[0-9]$/).optional().or(z.literal("")),
  supplierRazonSocial: z.string().trim().max(255).optional().or(z.literal("")),
  timbrado: z.string().trim().max(12).optional().or(z.literal("")),
  tipoComprobante: z.string().trim().max(60).optional().or(z.literal("")),
  numeroComprobante: z.string().trim().max(20).optional().or(z.literal("")),
  fecha: z.coerce.date().optional(),
  gravada10: z.coerce.number().nonnegative().default(0),
  gravada5: z.coerce.number().nonnegative().default(0),
  exenta: z.coerce.number().nonnegative().default(0),
  iva10: z.coerce.number().nonnegative().default(0),
  iva5: z.coerce.number().nonnegative().default(0),
  total: z.coerce.number().nonnegative().default(0),
  moneda: z.enum(["PYG", "USD"]).default("PYG"),
  categoryId: z.string().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;
