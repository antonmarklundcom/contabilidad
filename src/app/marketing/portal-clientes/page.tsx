import type { Metadata } from "next";
import {
  APP_URL,
  breadcrumbJsonLd,
  faqJsonLd,
  pageMetadata,
} from "@/lib/marketing";
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
  path: "/portal-clientes",
  title: "Portal de clientes",
  description:
    "Nuestros clientes ven sus vencimientos, cierres, libros y documentos en su propio portal, sin tener que pedir un archivo por WhatsApp.",
});

const FAQS = [
  {
    question: "¿El portal tiene costo aparte?",
    answer:
      "No. Es parte de cómo trabajamos: si llevamos tu contabilidad, tenés acceso. No es un producto que vendemos por separado.",
  },
  {
    question: "¿Puede entrar más de una persona de mi empresa?",
    answer:
      "Sí, con permisos distintos. Alguien puede cargar comprobantes sin poder cerrar un período ni tocar la configuración de la empresa; el cierre queda reservado a quien corresponda.",
  },
  {
    question: "¿Qué ve mi contador externo si tengo uno?",
    answer:
      "Lo que definamos con vos. Cada acceso está limitado a tu empresa y a las acciones que le habilitemos; no hay una vista global entre clientes.",
  },
];

const BLOCKS = [
  {
    title: "Próximos vencimientos",
    body: "La fecha que te corresponde según el último dígito de tu RUC, con aviso antes y no después.",
  },
  {
    title: "Cierres del período",
    body: "Cada mes cerrado con su informe en PDF, el detalle de casillas y el acuse de presentación archivado.",
  },
  {
    title: "Libros y exportaciones",
    body: "Ventas y compras del período, con exportación a CSV o XLSX cuando la necesitás.",
  },
  {
    title: "Documentos",
    body: "Constancias, acuses y respaldos guardados por período. Los documentos fiscales no se borran.",
  },
  {
    title: "Facturación electrónica",
    body: "Si emitís con nosotros, emitís desde el mismo lugar: KuDE, XML y estado del documento en SIFEN.",
  },
  {
    title: "Historial verificable",
    body: "Quién hizo qué y cuándo. Un número declarado tiene que poder explicarse tres años después.",
  },
];

export default function PortalPage() {
  return (
    <>
      <JsonLd data={faqJsonLd(FAQS)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Portal de clientes", path: "/portal-clientes" },
        ])}
      />

      <Section tone="paper" className="pt-14 sm:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <Eyebrow>Portal de clientes</Eyebrow>
            <h1 className="m-display">
              No tenés que pedirnos tus propios números
            </h1>
            <p className="m-lead mt-6 max-w-xl">
              La diferencia entre un estudio contable y el nuestro suele notarse
              un martes cualquiera, cuando necesitás saber cuánto te queda por
              pagar este mes y no querés esperar a que alguien te responda.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={APP_URL} className="m-btn m-btn-primary">
                Acceso clientes
              </a>
            </div>
          </div>

          {/* A structural sketch of the portal, marked as an example. */}
          <div className="m-card overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--m-line)] px-5 py-3">
              <span className="m-eyebrow">Panel</span>
              <span className="rounded-full border border-[var(--m-line)] px-2.5 py-1 text-xs text-[var(--m-muted)]">
                Ejemplo
              </span>
            </div>
            <div className="space-y-4 p-5 sm:p-6">
              <div className="rounded-lg bg-[var(--m-accent-wash)] p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--m-accent-ink)]">
                  Próximo vencimiento
                </p>
                <p className="mt-1 font-medium">
                  Declaración mensual de IVA · Formulario 120
                </p>
                <p className="mt-1 text-sm text-[var(--m-ink-soft)]">
                  Fecha según el último dígito del RUC
                </p>
              </div>
              {[
                ["Cierre del período anterior", "revisado"],
                ["Libro de ventas", "cerrado"],
                ["Libro de compras", "cerrado"],
                ["Documentos del período", "archivados"],
              ].map(([label, state]) => (
                <div
                  key={label}
                  className="flex items-center justify-between border-b border-dashed border-[var(--m-line)] pb-3 text-sm last:border-0 last:pb-0"
                >
                  <span className="text-[var(--m-ink-soft)]">{label}</span>
                  <span className="font-mono text-xs uppercase tracking-wide text-[var(--m-accent-ink)]">
                    {state}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section tone="surface">
        <SectionHeading
          eyebrow="Qué vas a encontrar"
          title="Todo lo del mes, en un solo lugar"
          lead="El portal no reemplaza al contador: muestra el estado real del trabajo que hacemos, cuando quieras verlo."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BLOCKS.map((block) => (
            <div key={block.title} className="m-card p-6">
              <h3 className="m-h3">{block.title}</h3>
              <p className="mt-2 text-[var(--m-ink-soft)]">{block.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="wash">
        <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <SectionHeading
            eyebrow="Sobre los datos"
            title="Tuyos, separados y recuperables"
            lead="Tres reglas que no negociamos, porque son las que hacen que el portal se pueda usar sin pensarlo."
          />
          <TickList
            items={[
              "Cada consulta está limitada a tu empresa: la separación es estructural, no una opción de pantalla.",
              "No guardamos tus claves de acceso al portal de DNIT.",
              "Tus documentos fiscales se conservan por el plazo de guarda legal y te los llevás si te vas.",
            ]}
          />
        </div>
      </Section>

      <Section tone="paper">
        <Container className="px-0">
          <SectionHeading
            eyebrow="Preguntas frecuentes"
            title="Sobre el portal"
          />
          <Faqs faqs={FAQS} />
        </Container>
      </Section>

      <ClosingCta
        title="¿Querés verlo con tus propios datos?"
        lead="En una primera conversación revisamos cómo trabajás hoy y qué haría falta para migrar sin que se te caiga un mes."
        message="Hola, quiero ver el portal de clientes."
      />
    </>
  );
}
