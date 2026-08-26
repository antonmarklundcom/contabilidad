import type { Metadata } from "next";
import Link from "next/link";
import {
  SERVICES,
  faqJsonLd,
  pageMetadata,
  servicePath,
} from "@/lib/marketing";
import { JsonLd } from "./json-ld";
import {
  ClosingCta,
  Container,
  CtaRow,
  Eyebrow,
  Faqs,
  Section,
  SectionHeading,
  Steps,
  TickList,
} from "./_components/ui";

const DESCRIPTION =
  "Estudio contable en Paraguay: facturación electrónica SIFEN, libros de IVA, Formulario 120 e IRP. Cada cifra verificada, cada decisión trazable.";

export const metadata: Metadata = pageMetadata({
  path: "/",
  title: "Estudio contable en Paraguay",
  description: DESCRIPTION,
});

const FAQS = [
  {
    question: "¿Con qué tipo de empresas trabajan?",
    answer:
      "Con empresas y profesionales que ya emiten o están por empezar a emitir documentos electrónicos, y con estudios contables que llevan varias carteras. Si tu caso no encaja, te lo decimos en la primera conversación.",
  },
  {
    question: "¿Puedo cambiar de contador a mitad de año?",
    answer:
      "Sí, y es más común de lo que parece. Lo primero que hacemos es revisar los períodos ya declarados y dejar por escrito en qué estado los recibimos, para que después no haya discusión sobre qué venía de antes.",
  },
  {
    question: "¿Ustedes presentan mis declaraciones con mi clave de Marangatú?",
    answer:
      "No custodiamos claves de acceso al portal. Preparamos la declaración completa, casilla por casilla, y acordamos con vos cómo se presenta. Una clave guardada es una clave que se puede filtrar.",
  },
  {
    question: "¿Qué pasa con mis documentos si dejamos de trabajar juntos?",
    answer:
      "Son tuyos y te los llevás: XML, KuDE, libros e informes de cierre. Los comprobantes fiscales tienen un plazo de guarda legal y nuestro archivo está armado para eso, no para retenerte.",
  },
];

const PILLARS = [
  {
    title: "Verificado, no estimado",
    body: "Los dígitos verificadores, la aritmética de cada comprobante y las casillas del formulario se recalculan con reglas fijas. Lo que no da, no pasa.",
  },
  {
    title: "Trazable tres años después",
    body: "Cada cierre queda a nombre de quien lo aprobó, con fecha, y no se edita. Si DNIT pregunta por un número en 2029, hay una cadena de respaldo, no una captura de pantalla.",
  },
  {
    title: "Sin custodia de claves",
    body: "No guardamos tus accesos al portal. Es una decisión deliberada sobre dónde queremos que esté el riesgo.",
  },
];

export default function HomePage() {
  const [lead, ...rest] = SERVICES;

  return (
    <>
      <JsonLd data={faqJsonLd(FAQS)} />

      {/* Split hero: the claim on the left, what a month actually ends in on
          the right. The card is labelled as an example — house rule. */}
      <Section tone="paper" className="pt-14 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="m-rise">
            <Eyebrow>Estudio contable · Paraguay</Eyebrow>
            <h1 className="m-display">
              Tu contabilidad al día, con cada cifra verificada
            </h1>
            <p className="m-lead mt-6 max-w-xl">
              Facturación electrónica, libros de IVA, Formulario 120 e IRP. Nos
              ocupamos del circuito completo y te entregamos un cierre mensual
              que se entiende sin ser contador.
            </p>
            <CtaRow message="Hola, quiero consultar por los servicios contables." />
            <p className="mt-6 text-sm text-[var(--m-muted)]">
              Atendemos a empresas, profesionales independientes y estudios
              contables.
            </p>
          </div>

          <div className="m-card p-6 sm:p-8">
            <div className="flex items-center justify-between gap-4">
              <p className="m-eyebrow">Cierre del mes</p>
              <span className="rounded-full border border-[var(--m-line)] px-2.5 py-1 text-xs text-[var(--m-muted)]">
                Ejemplo
              </span>
            </div>
            <dl className="mt-5 space-y-3.5 text-sm">
              {[
                ["Documentos emitidos y aprobados", "SIFEN"],
                ["Libro de ventas del período", "cerrado"],
                ["Libro de compras del período", "cerrado"],
                ["IVA débito y crédito por tasa", "conciliado"],
                ["Formulario 120, casilla por casilla", "listo"],
                ["Diferencias del período", "a la vista"],
              ].map(([label, state]) => (
                <div
                  key={label}
                  className="flex items-baseline justify-between gap-4 border-b border-dashed border-[var(--m-line)] pb-3 last:border-0"
                >
                  <dt className="text-[var(--m-ink-soft)]">{label}</dt>
                  <dd className="font-mono text-xs uppercase tracking-wide text-[var(--m-accent-ink)]">
                    {state}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-sm text-[var(--m-muted)]">
              El borrador del cierre está preparado al arrancar el mes, no la
              noche anterior al vencimiento.
            </p>
          </div>
        </div>
      </Section>

      {/* Services — bento: the lead service gets the wide cell. */}
      <Section tone="surface" id="servicios">
        <SectionHeading
          eyebrow="Servicios"
          title="Lo que hacemos, sin vueltas"
          lead="Cada servicio se puede contratar solo o como parte del trabajo mensual."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href={servicePath(lead.slug)}
            className="m-card m-card-link group flex flex-col justify-between p-7 sm:col-span-2"
          >
            <div>
              <Eyebrow>Lo más pedido</Eyebrow>
              <h3 className="m-h2">{lead.title}</h3>
              <p className="m-lead mt-3 max-w-lg">{lead.summary}</p>
            </div>
            <span className="mt-6 text-sm font-medium text-[var(--m-accent-ink)]">
              Ver el servicio →
            </span>
          </Link>
          {rest.map((service) => (
            <Link
              key={service.slug}
              href={servicePath(service.slug)}
              className="m-card m-card-link flex flex-col justify-between p-7"
            >
              <div>
                <h3 className="m-h3">{service.title}</h3>
                <p className="mt-2.5 text-[var(--m-ink-soft)]">
                  {service.summary}
                </p>
              </div>
              <span className="mt-6 text-sm font-medium text-[var(--m-accent-ink)]">
                Ver el servicio →
              </span>
            </Link>
          ))}
        </div>
      </Section>

      {/* Method — this is where the software appears, as how we work. */}
      <Section tone="paper">
        <SectionHeading
          eyebrow="Cómo trabajamos"
          title="Un circuito, no una carpeta de fin de mes"
          lead="Emisión, libros y declaración son partes del mismo proceso. Por eso el cierre no se arma dos veces ni se transcribe a mano."
        />
        <Steps
          steps={[
            {
              title: "Emitís y queda registrado",
              detail:
                "El documento electrónico que emitís es el mismo que alimenta el libro. No hay una segunda carga que pueda diferir.",
            },
            {
              title: "Los comprobantes se validan al entrar",
              detail:
                "RUC, aritmética y duplicados se controlan en el momento, no en el apuro del vencimiento.",
            },
            {
              title: "El borrador del cierre te espera",
              detail:
                "Al abrir el mes, el cierre del anterior ya está preparado con las diferencias listadas aparte.",
            },
            {
              title: "Una persona revisa y cierra",
              detail:
                "El cierre lleva nombre y fecha. Desde ese momento la versión declarada no se modifica.",
            },
          ]}
        />
      </Section>

      <Section tone="wash">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            eyebrow="Por qué nosotros"
            title="Preferimos ser verificables antes que rápidos"
          />
          <div className="grid gap-6 sm:grid-cols-3 lg:grid-cols-1">
            {PILLARS.map((pillar) => (
              <div
                key={pillar.title}
                className="lg:border-l lg:border-[var(--m-line)] lg:pl-6"
              >
                <h3 className="m-h3">{pillar.title}</h3>
                <p className="mt-2 text-[var(--m-ink-soft)]">{pillar.body}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Portal teaser */}
      <Section tone="surface">
        <div className="grid items-start gap-10 lg:grid-cols-2">
          <div>
            <Eyebrow>Portal de clientes</Eyebrow>
            <h2 className="m-h2">Tus números, cuando los necesitás</h2>
            <p className="m-lead mt-4">
              Nuestros clientes no dependen de pedirnos un archivo por WhatsApp.
              Entran a su portal y ven el estado real: vencimientos, cierres,
              comprobantes y documentos.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/portal-clientes" className="m-btn m-btn-primary">
                Ver qué incluye el portal
              </Link>
            </div>
          </div>
          <TickList
            className="lg:pt-10"
            items={[
              "Próximos vencimientos, con la fecha que corresponde a tu RUC",
              "Cierres mensuales con su informe en PDF",
              "Libros de ventas y compras exportables",
              "Documentos y acuses archivados por período",
              "Facturación electrónica desde el mismo lugar",
            ]}
          />
        </div>
      </Section>

      <Section tone="paper">
        <Container className="px-0">
          <SectionHeading
            eyebrow="Preguntas frecuentes"
            title="Lo que nos preguntan primero"
          />
          <Faqs faqs={FAQS} />
        </Container>
      </Section>

      <ClosingCta message="Hola, quiero consultar por los servicios contables." />
    </>
  );
}
