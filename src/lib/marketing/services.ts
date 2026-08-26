/**
 * The service catalogue — the marketing site's content, not the app's.
 *
 * Data rather than JSX so `/servicios/[slug]`, the hub cards, the sitemap and
 * the JSON-LD all read the same source and cannot drift. Copy is Paraguayan
 * Spanish (voseo), matching the app's own dictionaries.
 *
 * What the copy may say is bounded by `CLAUDE.md`'s anti-fabrication rule and
 * by STRATEGY.md's refusals: no client counts, no testimonials, no accuracy
 * claim like "nunca nos equivocamos", no promise to file on the client's
 * behalf inside Marangatú. Everything below describes work actually performed
 * or a verifiable property of the process.
 */

export type ServiceFaq = { question: string; answer: string };

export type Service = {
  slug: string;
  /** Page `<h1>`. */
  title: string;
  /** Short label for navigation and cards. */
  navLabel: string;
  /** ≤ 60 characters — the `<title>`. */
  metaTitle: string;
  /** ≤ 155 characters — the meta description. */
  metaDescription: string;
  /** One sentence on the hub card. */
  summary: string;
  /** Lead paragraphs on the service page. */
  intro: string[];
  /** What the service concretely includes. */
  includes: string[];
  /** How the work runs, in order. */
  process: { title: string; detail: string }[];
  /** What the client ends up holding. */
  deliverables: string[];
  faqs: ServiceFaq[];
  /** Slugs of the two or three services worth linking on from here. */
  related: string[];
};

export const SERVICES: readonly Service[] = [
  {
    slug: "facturacion-electronica-sifen",
    title: "Facturación electrónica (SIFEN / e-Kuatiá)",
    navLabel: "Facturación electrónica",
    metaTitle: "Facturación electrónica SIFEN en Paraguay",
    metaDescription:
      "Emisión de documentos electrónicos ante SIFEN: timbrado, KuDE, cancelaciones dentro de las 48 horas y el XML archivado. Escribinos y lo dejamos andando.",
    summary:
      "Emitimos y custodiamos tus documentos electrónicos ante SIFEN, con el XML y el KuDE archivados desde el primer día.",
    intro: [
      "La factura electrónica dejó de ser un proyecto a futuro: el calendario de obligatoriedad de DNIT avanza por grupos y, una vez que te toca, el comprobante en papel deja de servirte. Nosotros nos ocupamos del circuito completo, desde el timbrado hasta el archivo del XML.",
      "No es solamente “emitir”. Cada documento tiene un CDC, un estado en SIFEN, una numeración que no puede saltearse y una ventana de 48 horas para cancelarlo. Ese seguimiento es el trabajo real, y es el que te sacamos de encima.",
    ],
    includes: [
      "Alta y seguimiento del timbrado y de los puntos de expedición",
      "Emisión de facturas, notas de crédito y notas de débito electrónicas",
      "Envío a SIFEN y seguimiento del estado hasta la aprobación",
      "KuDE en PDF y XML firmado, listos para entregar al cliente",
      "Cancelaciones y eventos dentro del plazo que habilita la normativa",
      "Archivo de los XML por el plazo de guarda legal",
    ],
    process: [
      {
        title: "Revisamos tu situación ante DNIT",
        detail:
          "Timbrado vigente, puntos de expedición, numeración en uso y qué documentos emitís hoy.",
      },
      {
        title: "Configuramos la emisión",
        detail:
          "Datos del emisor, actividades económicas, productos y clientes habituales quedan cargados una sola vez.",
      },
      {
        title: "Emitís y nosotros seguimos el documento",
        detail:
          "Controlamos que cada comprobante llegue a estado aprobado y actuamos sobre los rechazados el mismo día.",
      },
      {
        title: "Cerramos el mes con el libro ya armado",
        detail:
          "Lo que emitiste alimenta directamente el libro de ventas, sin recargar nada a mano.",
      },
    ],
    deliverables: [
      "KuDE en PDF para entregar al cliente",
      "XML firmado de cada documento, archivado",
      "Detalle mensual de emitidos, aprobados, rechazados y cancelados",
    ],
    faqs: [
      {
        question: "¿Necesito mi propio certificado digital?",
        answer:
          "Sí. La firma del documento electrónico se hace con el certificado del contribuyente, a nombre de tu empresa. Te acompañamos en la gestión y lo dejamos configurado, pero el certificado es tuyo y queda bajo tu control.",
      },
      {
        question: "¿Qué pasa si SIFEN rechaza un documento?",
        answer:
          "El rechazo llega con un código y un mensaje de SIFEN. Lo revisamos, te decimos en castellano qué campo hay que corregir y reemitimos. Los rechazos y sus motivos quedan registrados, no se pierden.",
      },
      {
        question: "¿Se puede anular una factura electrónica?",
        answer:
          "No se “borra”: se emite un evento de cancelación, y la normativa da un plazo acotado desde la emisión para hacerlo. Pasado ese plazo, la corrección va por nota de crédito. Nosotros controlamos ese plazo por vos.",
      },
    ],
    related: [
      "libros-iva",
      "declaracion-iva-formulario-120",
      "conciliacion-de-comprobantes",
    ],
  },
  {
    slug: "libros-iva",
    title: "Libros de ventas y compras",
    navLabel: "Libros IVA",
    metaTitle: "Libros de ventas y compras IVA | Paraguay",
    metaDescription:
      "Armamos y mantenemos tus libros de ventas y compras mes a mes, con el IVA débito y crédito conciliado contra los comprobantes reales.",
    summary:
      "Los libros al día todos los meses, con el IVA débito y crédito ya conciliado contra tus comprobantes.",
    intro: [
      "El libro no es un trámite de fin de mes: es la base sobre la que se apoya la declaración, y cualquier diferencia que quede ahí reaparece más tarde, cuando es más cara de arreglar.",
      "Trabajamos con los comprobantes reales — los que emitiste y los que recibiste — y dejamos el libro cerrado con el IVA débito y crédito ya separado por tasa.",
    ],
    includes: [
      "Registro de ventas a partir de los documentos efectivamente emitidos",
      "Registro de compras con los comprobantes de tus proveedores",
      "Separación del IVA por tasa (10 % y 5 %) y de las operaciones exentas",
      "Detección de saltos de numeración en tus propios comprobantes",
      "Exportación en CSV o XLSX cuando la necesitás",
    ],
    process: [
      {
        title: "Nos pasás los comprobantes de compra",
        detail:
          "Foto, PDF o el archivo de comprobantes electrónicos: lo que te resulte más cómodo.",
      },
      {
        title: "Cargamos y validamos",
        detail:
          "Se controla el RUC del proveedor, la aritmética del comprobante y que no esté duplicado.",
      },
      {
        title: "Conciliamos contra lo emitido",
        detail:
          "Las ventas del libro salen de los documentos aprobados, no de una planilla aparte.",
      },
      {
        title: "Cerramos el período",
        detail:
          "El libro queda cerrado y disponible para vos, y alimenta la declaración del mes.",
      },
    ],
    deliverables: [
      "Libro de ventas y libro de compras del período",
      "Resumen de IVA débito, IVA crédito y posición del mes",
      "Exportación en CSV o XLSX",
    ],
    faqs: [
      {
        question: "¿Cómo les hago llegar los comprobantes?",
        answer:
          "Como te quede cómodo: foto desde el celular, PDF por correo, o el archivo de comprobantes electrónicos que descargás de Marangatú. Nosotros nos encargamos de la carga.",
      },
      {
        question:
          "¿Qué pasa con un comprobante que no corresponde a la empresa?",
        answer:
          "Lo marcamos como no deducible y queda registrado con ese criterio y la fecha en que se decidió. La decisión la confirma una persona, no se resuelve sola.",
      },
    ],
    related: [
      "declaracion-iva-formulario-120",
      "conciliacion-de-comprobantes",
      "contabilidad-mensual",
    ],
  },
  {
    slug: "declaracion-iva-formulario-120",
    title: "Declaración mensual de IVA (Formulario 120)",
    navLabel: "IVA mensual (F. 120)",
    metaTitle: "Declaración de IVA Formulario 120 | Paraguay",
    metaDescription:
      "Preparamos tu Formulario 120 cada mes: casillas calculadas desde los libros, saldo anterior arrastrado y el vencimiento controlado según tu RUC.",
    summary:
      "El Formulario 120 preparado casilla por casilla desde tus libros, con el vencimiento controlado según tu RUC.",
    intro: [
      "Todos los meses hay una fecha, y la fecha depende del último dígito de tu RUC. Nosotros la controlamos y trabajamos hacia atrás desde ahí, para que la declaración no se arme la noche anterior.",
      "Las casillas del formulario salen calculadas desde los libros del período — no se transcriben de memoria — e incluyen el saldo a favor que viene del mes anterior.",
    ],
    includes: [
      "Cálculo de las casillas del Formulario 120 a partir del libro del período",
      "Arrastre del saldo a favor del período anterior",
      "Control del vencimiento según el último dígito del RUC",
      "Revisión de diferencias antes de cerrar el período",
      "Cierre del período con un informe firmado por quien lo revisó",
    ],
    process: [
      {
        title: "El borrador está listo antes de que preguntes",
        detail:
          "Al cerrar el mes preparamos el borrador de la declaración; no empieza cuando se acerca el vencimiento.",
      },
      {
        title: "Revisamos las diferencias",
        detail:
          "Antes de declarar se listan los faltantes y las inconsistencias del período, para resolverlas o dejarlas documentadas.",
      },
      {
        title: "Lo revisás y lo cerramos",
        detail:
          "El cierre queda a nombre de quien lo aprobó, con fecha. Esa versión ya no se modifica.",
      },
      {
        title: "Presentación y comprobante",
        detail:
          "Se presenta la declaración y el acuse queda archivado junto al período que le corresponde.",
      },
    ],
    deliverables: [
      "Detalle casilla por casilla del Formulario 120",
      "Informe de cierre del período en PDF",
      "Acuse de presentación archivado",
    ],
    faqs: [
      {
        question: "¿Cuándo vence mi declaración?",
        answer:
          "El vencimiento depende del último dígito de tu RUC, sin contar el dígito verificador, según el calendario perpetuo de DNIT. Cuando el día cae en feriado o asueto, se corre. Nosotros lo controlamos por vos y te avisamos antes.",
      },
      {
        question: "¿Ustedes entran a Marangatú con mi clave?",
        answer:
          "No custodiamos claves de acceso de nuestros clientes al portal. Es una decisión deliberada: una clave guardada es una clave que se puede filtrar. La declaración queda preparada y presentada dentro del marco que acordemos con vos.",
      },
      {
        question:
          "¿Qué pasa si después aparece un comprobante del mes cerrado?",
        answer:
          "El cierre no se edita: se abre un período nuevo o se rectifica, y queda constancia de qué cambió y cuándo. Un número declarado tiene que poder explicarse tres años después.",
      },
    ],
    related: [
      "libros-iva",
      "irp-personas-fisicas",
      "conciliacion-de-comprobantes",
    ],
  },
  {
    slug: "irp-personas-fisicas",
    title: "IRP — Impuesto a la Renta Personal",
    navLabel: "IRP anual",
    metaTitle: "IRP: declaración anual de renta personal",
    metaDescription:
      "Declaración anual del IRP: ingresos y egresos del ejercicio, gastos deducibles documentados y el régimen que corresponde a tu situación.",
    summary:
      "La declaración anual del IRP armada sobre doce meses de registros, no sobre un resumen de última hora.",
    intro: [
      "El IRP se declara una vez al año, pero se construye durante los doce meses anteriores. Quien llega a la fecha con los comprobantes sueltos termina deduciendo menos de lo que le corresponde, simplemente porque no puede documentarlo.",
      "Trabajamos el ejercicio completo: ingresos, egresos deducibles y el régimen aplicable a tu caso, con el respaldo documental de cada línea.",
    ],
    includes: [
      "Consolidación de los ingresos del ejercicio",
      "Revisión de los egresos deducibles con su comprobante de respaldo",
      "Determinación del régimen que corresponde a tu situación",
      "Liquidación anual y preparación de la declaración",
      "Archivo del ejercicio cerrado con su respaldo",
    ],
    process: [
      {
        title: "Definimos el régimen",
        detail:
          "Es una decisión explícita sobre tu situación real, no un supuesto: cambia la liquidación entera.",
      },
      {
        title: "Consolidamos el ejercicio",
        detail:
          "Los doce meses de ingresos y egresos, con el comprobante que respalda cada uno.",
      },
      {
        title: "Liquidamos y revisamos con vos",
        detail: "Ves de dónde sale cada cifra antes de que se declare nada.",
      },
      {
        title: "Cierre y archivo",
        detail:
          "El ejercicio cerrado queda archivado, con el acuse de presentación.",
      },
    ],
    deliverables: [
      "Liquidación anual del IRP",
      "Detalle de ingresos y egresos deducibles del ejercicio",
      "Acuse de presentación archivado",
    ],
    faqs: [
      {
        question: "¿Todo gasto es deducible?",
        answer:
          "No, y ahí se pierde plata en las dos direcciones. Cada egreso se evalúa contra tu actividad y tiene que estar respaldado por un comprobante válido. Lo que no cumple queda fuera, documentado, y no vuelve a discutirse el año siguiente.",
      },
      {
        question: "¿Cuándo conviene empezar?",
        answer:
          "Cuanto antes, aunque falten meses. Registrar los comprobantes durante el ejercicio cuesta poco; reconstruir el año en la semana previa al vencimiento cuesta mucho y casi siempre deduce menos.",
      },
    ],
    related: [
      "declaracion-iva-formulario-120",
      "contabilidad-mensual",
      "libros-iva",
    ],
  },
  {
    slug: "contabilidad-mensual",
    title: "Contabilidad mensual para empresas",
    navLabel: "Contabilidad mensual",
    metaTitle: "Contabilidad mensual para empresas | Paraguay",
    metaDescription:
      "Contabilidad mensual con cierre en fecha: libros, obligaciones al día, calendario tributario controlado y un informe que se entiende sin ser contador.",
    summary:
      "Tu contabilidad al día todos los meses, con un informe que se entiende sin ser contador.",
    intro: [
      "La mayoría de las empresas no necesita más informes: necesita que los que ya tiene lleguen a tiempo y digan algo. Nuestro trabajo mensual termina en un cierre con fecha, no en una carpeta.",
      "Emisión, libros, obligaciones y calendario en un mismo circuito, para que nada dependa de acordarse.",
    ],
    includes: [
      "Registro contable del mes",
      "Libros de ventas y compras al día",
      "Control del calendario de obligaciones de la empresa",
      "Informe mensual de resultado y posición de IVA",
      "Alertas de vencimientos antes de la fecha, no después",
    ],
    process: [
      {
        title: "Relevamiento inicial",
        detail:
          "Obligaciones vigentes, timbrado, situación ante DNIT y cómo trabajás hoy.",
      },
      {
        title: "Circuito mensual",
        detail:
          "Fechas fijas para entregar comprobantes y para recibir el cierre.",
      },
      {
        title: "Cierre y revisión",
        detail:
          "El mes se cierra con un responsable y una fecha, y se archiva.",
      },
      {
        title: "Seguimiento del calendario",
        detail:
          "Los vencimientos se avisan con anticipación, no el día anterior.",
      },
    ],
    deliverables: [
      "Cierre mensual con informe en PDF",
      "Libros del período",
      "Calendario de próximos vencimientos",
    ],
    faqs: [
      {
        question: "¿Trabajan con empresas que ya tienen contador?",
        answer:
          "Sí. A veces el encargo es puntual — ordenar los comprobantes electrónicos, revisar un período, poner los libros al día — y el trabajo mensual sigue donde está. Lo conversamos sin compromiso.",
      },
      {
        question: "¿Qué necesitan de nosotros cada mes?",
        answer:
          "Los comprobantes de compra y los movimientos del mes. Lo demás sale de lo que vos ya emitís, porque la emisión y el libro son el mismo circuito.",
      },
    ],
    related: [
      "libros-iva",
      "declaracion-iva-formulario-120",
      "facturacion-electronica-sifen",
    ],
  },
  {
    slug: "conciliacion-de-comprobantes",
    title: "Conciliación de comprobantes y períodos",
    navLabel: "Conciliación",
    metaTitle: "Conciliación de comprobantes y períodos",
    metaDescription:
      "Revisamos el período contra los comprobantes reales: diferencias, duplicados, saltos de numeración y comprobantes recibidos verificados por su CDC.",
    summary:
      "Buscamos las diferencias antes de que las busque DNIT: duplicados, faltantes y saltos de numeración.",
    intro: [
      "Un período “cerrado” con diferencias adentro es una deuda a plazo. La conciliación es el trabajo de encontrarlas mientras todavía son baratas de resolver.",
      "Comparamos lo declarado con los comprobantes reales del período y te entregamos la lista completa de hallazgos, incluidos los que no tienen solución cómoda.",
    ],
    includes: [
      "Cruce del período contra los comprobantes registrados",
      "Detección de duplicados y de comprobantes faltantes",
      "Saltos de numeración en tus propios documentos emitidos",
      "Verificación de comprobantes recibidos a partir de su CDC",
      "Informe de hallazgos, con lo resuelto y lo pendiente por separado",
    ],
    process: [
      {
        title: "Definimos el alcance",
        detail: "Qué períodos se revisan y con qué documentación se cuenta.",
      },
      {
        title: "Cruzamos",
        detail:
          "Comprobante por comprobante contra lo registrado y lo declarado.",
      },
      {
        title: "Clasificamos los hallazgos",
        detail:
          "Lo que se corrige, lo que se rectifica y lo que solo se documenta.",
      },
      {
        title: "Entregamos el informe",
        detail: "Con los hallazgos a la vista, incluidos los incómodos.",
      },
    ],
    deliverables: [
      "Informe de conciliación del período",
      "Listado de diferencias con su clasificación",
      "Recomendación concreta para cada hallazgo",
    ],
    faqs: [
      {
        question: "¿Qué es el CDC y por qué lo revisan?",
        answer:
          "Es el código que identifica a cada documento electrónico y que codifica al emisor, el número y la fecha. Verificarlo permite detectar que un comprobante recibido no dice lo que aparenta, antes de tomarte el crédito fiscal.",
      },
      {
        question: "¿Sirve si mi contabilidad la lleva otro estudio?",
        answer:
          "Sí. La conciliación es un encargo puntual y se puede contratar sola. El informe queda para vos y para quien lleve la contabilidad.",
      },
    ],
    related: [
      "libros-iva",
      "declaracion-iva-formulario-120",
      "facturacion-electronica-sifen",
    ],
  },
  {
    slug: "estudios-contables",
    title: "Para estudios contables",
    navLabel: "Estudios contables",
    metaTitle: "Servicio para estudios contables | Paraguay",
    metaDescription:
      "Trabajamos con estudios que llevan varias carteras: emisión, libros y borradores de cierre listos el primer día del mes, cliente por cliente.",
    summary:
      "Si llevás varias carteras, los borradores de cierre te esperan el día 1, cliente por cliente.",
    intro: [
      "Un estudio no pierde tiempo en la parte difícil: lo pierde repitiendo la misma carga veinte veces, con veinte vencimientos distintos según el RUC de cada cliente.",
      "Trabajamos con estudios para que esa parte esté hecha: cada cartera con su emisión, sus libros y su borrador de cierre esperando revisión.",
    ],
    includes: [
      "Alta de las carteras con sus datos y obligaciones",
      "Emisión y libros por cliente, separados",
      "Borrador de cierre mensual listo al inicio del mes",
      "Calendario consolidado de vencimientos por cliente",
      "Accesos diferenciados para el equipo del estudio",
    ],
    process: [
      {
        title: "Migramos las carteras",
        detail: "Datos, obligaciones y numeración vigente.",
      },
      {
        title: "Definimos accesos",
        detail: "Quién revisa, quién cierra y quién solo consulta, por rol.",
      },
      {
        title: "Circuito mensual por cliente",
        detail: "Cada cartera avanza sola; el estudio revisa y cierra.",
      },
      {
        title: "Consolidado del mes",
        detail: "Estado de todas las carteras en una sola vista.",
      },
    ],
    deliverables: [
      "Borradores de cierre por cliente",
      "Calendario consolidado de vencimientos",
      "Libros e informes por cartera",
    ],
    faqs: [
      {
        question: "¿Cada cliente ve solo lo suyo?",
        answer:
          "Sí. La separación por empresa es estructural, no una opción de pantalla: cada consulta está limitada a la empresa de la sesión.",
      },
      {
        question: "¿Se puede empezar con una parte de la cartera?",
        answer:
          "Es lo que recomendamos. Se arranca con unos pocos clientes, se compara contra el circuito actual del estudio y recién después se migra el resto.",
      },
    ],
    related: [
      "contabilidad-mensual",
      "facturacion-electronica-sifen",
      "conciliacion-de-comprobantes",
    ],
  },
];

export function serviceBySlug(slug: string): Service | undefined {
  return SERVICES.find((service) => service.slug === slug);
}

export function servicePath(slug: string): string {
  return `/servicios/${slug}`;
}
