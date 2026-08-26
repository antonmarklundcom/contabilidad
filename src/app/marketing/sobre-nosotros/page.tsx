import type { Metadata } from "next";
import { FIRM, breadcrumbJsonLd, pageMetadata } from "@/lib/marketing";
import { JsonLd } from "../json-ld";
import {
  ClosingCta,
  Eyebrow,
  Section,
  SectionHeading,
  TickList,
} from "../_components/ui";

export const metadata: Metadata = pageMetadata({
  path: "/sobre-nosotros",
  title: "Sobre nosotros",
  description:
    "Cómo trabajamos y qué nos negamos a hacer: cifras verificadas con reglas fijas, decisiones trazables y ninguna custodia de claves de acceso.",
});

/**
 * Deliberately about method, not about people.
 *
 * Team bios, years of experience and client counts are facts only the owner
 * has; inventing them here is exactly what `CLAUDE.md` forbids. The
 * matriculado line renders only once `firm.ts` carries a real matrícula.
 */
export default function SobreNosotrosPage() {
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Inicio", path: "/" },
          { name: "Sobre nosotros", path: "/sobre-nosotros" },
        ])}
      />

      <Section tone="paper" className="pt-14 sm:pt-20">
        <div className="max-w-3xl">
          <Eyebrow>Sobre nosotros</Eyebrow>
          <h1 className="m-display">
            Un estudio que prefiere mostrar de dónde sale cada número
          </h1>
          <p className="m-lead mt-6">
            La contabilidad de una empresa chica no falla por falta de
            conocimiento técnico. Falla por comprobantes que llegan tarde,
            períodos que se cierran a las apuradas y números que nadie puede
            explicar meses después. Nuestro trabajo está armado alrededor de
            eso.
          </p>
          {FIRM.contador ? (
            <p className="mt-6 text-[var(--m-ink-soft)]">
              El trabajo lo firma {FIRM.contador.name}, contador matriculado
              bajo la matrícula {FIRM.contador.matricula}.
            </p>
          ) : null}
        </div>
      </Section>

      <Section tone="surface">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionHeading
            eyebrow="Cómo trabajamos"
            title="Tres reglas de la casa"
            lead="No son valores de folleto: se notan en el trabajo de todos los meses."
          />
          <div className="space-y-8">
            <div>
              <h3 className="m-h3">Lo que se puede verificar, se verifica</h3>
              <p className="mt-2 text-[var(--m-ink-soft)]">
                Dígitos verificadores, aritmética de comprobantes y casillas de
                la declaración se recalculan con reglas fijas, no a ojo. Lo que
                queda en zona gris se marca como tal y lo decide una persona, no
                un supuesto.
              </p>
            </div>
            <div>
              <h3 className="m-h3">
                Un cierre es un compromiso, no un borrador
              </h3>
              <p className="mt-2 text-[var(--m-ink-soft)]">
                El período cerrado lleva nombre y fecha de quien lo aprobó y no
                se edita después. Si aparece algo nuevo, se rectifica dejando
                constancia. Es más incómodo y es la única forma de que el número
                signifique algo.
              </p>
            </div>
            <div>
              <h3 className="m-h3">Preferimos decir que no</h3>
              <p className="mt-2 text-[var(--m-ink-soft)]">
                No guardamos claves de acceso de clientes al portal, no
                prometemos exactitud infalible y no deducimos un gasto que no se
                puede respaldar. Cada una de esas negativas nos cuesta algún
                cliente y nos evita el problema serio.
              </p>
            </div>
          </div>
        </div>
      </Section>

      <Section tone="wash">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <SectionHeading
            eyebrow="Para quién"
            title="Con quiénes trabajamos mejor"
          />
          <TickList
            items={[
              "Empresas que ya emiten documentos electrónicos o están por empezar",
              "Profesionales independientes con IVA mensual e IRP anual",
              "Estudios contables que llevan varias carteras y quieren sacarse la carga repetitiva",
              "Empresas que vienen de un período desordenado y quieren ponerse al día de una vez",
            ]}
          />
        </div>
      </Section>

      <ClosingCta message="Hola, quiero conocer más sobre el estudio." />
    </>
  );
}
