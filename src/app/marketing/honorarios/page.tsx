import type { Metadata } from "next";
import { breadcrumbJsonLd, faqJsonLd, pageMetadata } from "@/lib/marketing";
import { JsonLd } from "../json-ld";
import {
  ClosingCta,
  Container,
  Eyebrow,
  Faqs,
  Section,
  SectionHeading,
  TickList,
} from "../_components/ui";

export const metadata: Metadata = pageMetadata({
  path: "/honorarios",
  title: "Honorarios",
  description:
    "Cómo se calculan nuestros honorarios: qué los mueve, qué incluye siempre el trabajo mensual y qué se cobra aparte. Propuesta escrita antes de empezar.",
});

const FAQS = [
  {
    question: "¿Por qué no publican una tarifa única?",
    answer:
      "Porque no sería cierta. El trabajo de una empresa que emite quince documentos al mes no es el de una que emite mil, ni el de una que además tiene IRP. Publicar un número redondo obligaría a cobrar de más a la mitad de los casos.",
  },
  {
    question: "¿Cómo sé cuánto voy a pagar antes de empezar?",
    answer:
      "Con una propuesta escrita. Revisamos tus obligaciones vigentes y el volumen real de comprobantes, y te pasamos el monto mensual y qué incluye. Si después el volumen cambia de forma sostenida, se conversa antes de facturarlo distinto.",
  },
  {
    question: "¿Hay costo de puesta en marcha?",
    answer:
      "Depende del estado en que recibimos la contabilidad. Migrar una empresa al día es parte del trabajo; regularizar períodos atrasados es un encargo aparte y se cotiza aparte, para que no quede escondido dentro del mensual.",
  },
];

const DRIVERS = [
  {
    title: "Volumen de comprobantes",
    body: "Cuántos documentos emitís y cuántos recibís por mes. Es el factor que más pesa, y el único que se puede medir sin discutir.",
  },
  {
    title: "Obligaciones vigentes",
    body: "No es lo mismo IVA mensual solo que IVA más IRP, o una empresa con obligaciones adicionales según su actividad.",
  },
  {
    title: "Estado inicial",
    body: "Una contabilidad al día se migra rápido. Un período atrasado se regulariza, y eso se cotiza por separado y por única vez.",
  },
  {
    title: "Alcance del encargo",
    body: "Trabajo mensual completo, o un encargo puntual como una conciliación de períodos o poner los libros al día.",
  },
];

export default function HonorariosPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(FAQS)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Honorarios", path: "/honorarios" },
        ])}
      />

      <Section tone="paper" className="pt-14 sm:pt-20">
        <div className="max-w-3xl">
          <Eyebrow>Honorarios</Eyebrow>
          <h1 className="m-display">Cómo cobramos, dicho antes de empezar</h1>
          <p className="m-lead mt-6">
            No publicamos una tarifa única porque no existe una sola realidad
            contable. Lo que sí podemos decir de antemano es qué mueve el
            precio, qué está siempre incluido y qué se cobra aparte.
          </p>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading
          eyebrow="Qué define el monto"
          title="Cuatro factores, ninguno oculto"
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {DRIVERS.map((driver) => (
            <div key={driver.title} className="m-card p-6 sm:p-7">
              <h3 className="m-h3">{driver.title}</h3>
              <p className="mt-2 text-[var(--m-ink-soft)]">{driver.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="wash">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading
              eyebrow="Siempre incluido"
              title="Va dentro del trabajo mensual"
            />
            <TickList
              className="mt-6"
              items={[
                "Registro del período y libros de ventas y compras",
                "Preparación de la declaración mensual de IVA",
                "Control del calendario de vencimientos de tu empresa",
                "Informe de cierre mensual en PDF",
                "Acceso al portal de clientes para vos y tu equipo",
                "Archivo de los documentos del período",
              ]}
            />
          </div>
          <div>
            <SectionHeading
              eyebrow="Se cotiza aparte"
              title="Encargos que no son del mes"
            />
            <TickList
              className="mt-6"
              items={[
                "Regularización de períodos atrasados",
                "Conciliación de períodos ya declarados",
                "Declaración anual del IRP, cuando corresponde",
                "Puesta en marcha de la facturación electrónica desde cero",
                "Trámites y gestiones puntuales ante DNIT",
              ]}
            />
          </div>
        </div>
      </Section>

      <Section tone="paper">
        <Container className="px-0">
          <SectionHeading
            eyebrow="Preguntas frecuentes"
            title="Sobre los honorarios"
          />
          <Faqs faqs={FAQS} />
        </Container>
      </Section>

      <ClosingCta
        title="Pedí tu propuesta"
        lead="Contanos cuántos comprobantes manejás por mes y qué obligaciones tenés vigentes. Con eso te pasamos un monto y qué incluye, por escrito."
        message="Hola, quiero pedir una propuesta de honorarios."
      />
    </>
  );
}
