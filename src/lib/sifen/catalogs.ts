/**
 * SIFEN catalogs, re-exported from facturacionelectronicapy-xmlgen so the
 * whole app uses the exact codes the XML generator validates against.
 * (Manual Técnico 150 — departamentos, distritos, ciudades, países,
 * unidades de medida and every enum-like list.)
 */
import constants from "facturacionelectronicapy-xmlgen/dist/services/constants.service";

export interface CatalogItem {
  codigo: number | string;
  descripcion: string;
}

export interface UnidadMedida {
  codigo: number;
  representacion: string;
  descripcion: string;
}

export const departamentos: CatalogItem[] = constants.departamentos;
export const distritos: (CatalogItem & { departamento: number })[] = constants.distritos as never;
export const ciudades: (CatalogItem & { distrito: number })[] = constants.ciudades as never;
export const paises: CatalogItem[] = constants.paises;
export const unidadesMedidas: UnidadMedida[] = constants.unidadesMedidas;
export const tiposDocumentos: CatalogItem[] = constants.tiposDocumentos;
export const tiposContribuyentes: CatalogItem[] = [
  { codigo: 1, descripcion: "Persona Física" },
  { codigo: 2, descripcion: "Persona Jurídica" },
];
export const tiposRegimenes: CatalogItem[] = constants.tiposRegimenes;
export const notasCreditosMotivos: CatalogItem[] = constants.notasCreditosMotivos;
export const condicionesOperaciones: CatalogItem[] = constants.condicionesOperaciones; // 1 Contado, 2 Crédito
export const condicionesTiposPagos: CatalogItem[] = constants.condicionesTiposPagos;
export const monedas: CatalogItem[] = constants.monedas;
export const tiposTransacciones: CatalogItem[] = constants.tiposTransacciones;
export const indicadoresPresencias: CatalogItem[] = constants.indicadoresPresencias;
export const tiposDocumentosIdentidades: CatalogItem[] = constants.tiposDocumentosIdentidades;

export function findDepartamento(desc: string): CatalogItem | undefined {
  return departamentos.find((d) =>
    d.descripcion.toUpperCase().includes(desc.toUpperCase())
  );
}

export function findDistrito(desc: string, departamento?: number) {
  return distritos.find(
    (d) =>
      d.descripcion.toUpperCase().includes(desc.toUpperCase()) &&
      (departamento === undefined || d.departamento === departamento)
  );
}

export function findCiudad(desc: string, distrito?: number) {
  return ciudades.find(
    (c) =>
      c.descripcion.toUpperCase().includes(desc.toUpperCase()) &&
      (distrito === undefined || c.distrito === distrito)
  );
}
