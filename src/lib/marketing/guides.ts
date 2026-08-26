/**
 * Explainers for the resources hub.
 *
 * A content section that ships empty is worse than none — thin pages are the
 * classic own goal of a "blog coming soon". So the hub launches with real
 * explanations of things clients actually ask about, written to be useful on
 * their own rather than as keyword bait.
 *
 * The same honesty rules apply as everywhere else: these describe how the
 * documents and the process work, and deliberately do **not** state specific
 * legal deadlines, resolution numbers or thresholds, which change and which
 * we would be asserting from memory. Where a date matters, the text says what
 * it depends on and points the reader at us or at DNIT.
 */

export type GuideSection = { heading: string; body: string[] };

export type Guide = {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  summary: string;
  /** ISO date the text was written. Not backdated, not invented. */
  published: string;
  readingMinutes: number;
  sections: GuideSection[];
  /** Service slugs this guide should send the reader to. */
  related: string[];
};

export const GUIDES: readonly Guide[] = [
  {
    slug: "que-es-el-cdc",
    title: "Qué es el CDC de un documento electrónico",
    metaTitle: "Qué es el CDC de una factura electrónica",
    metaDescription:
      "El CDC identifica cada documento electrónico y codifica emisor, número y fecha. Qué contiene, por qué tiene dígito verificador y para qué sirve revisarlo.",
    summary:
      "El código que identifica cada documento electrónico, qué información lleva adentro y por qué conviene revisarlo antes de tomarte el crédito fiscal.",
    published: "2026-08-26",
    readingMinutes: 4,
    sections: [
      {
        heading: "Un identificador, no un número de factura",
        body: [
          "Cada documento electrónico aprobado en SIFEN tiene un CDC: el Código de Control que lo identifica de forma única. No reemplaza al número del comprobante, lo envuelve. El número sigue siendo el que ves en el KuDE; el CDC es lo que permite que ese comprobante sea localizable y verificable fuera de tu sistema.",
          "Es una cadena larga de dígitos, y esa longitud tiene una razón: no es un correlativo, es información concatenada.",
        ],
      },
      {
        heading: "Qué lleva adentro",
        body: [
          "El CDC codifica, entre otras cosas, el tipo de documento, el RUC del emisor, el establecimiento y punto de expedición, el número del comprobante y la fecha de emisión. Es decir: buena parte de lo que el comprobante dice de sí mismo también está dentro de su identificador.",
          "Eso tiene una consecuencia práctica muy concreta. Si el cuerpo del documento dice una cosa y el CDC dice otra —otro emisor, otro número, otra fecha— algo no cierra, y se puede detectar sin consultar nada.",
        ],
      },
      {
        heading: "El dígito verificador",
        body: [
          "El último dígito del CDC es un verificador calculado sobre los anteriores, con el mismo tipo de algoritmo de módulo 11 que valida el RUC paraguayo. Sirve para lo mismo: detectar un dígito mal transcrito o una cadena inventada, sin preguntarle a nadie.",
          "Un CDC que no pasa su propio dígito verificador no es un comprobante con un problema: no es un CDC.",
        ],
      },
      {
        heading: "Por qué conviene revisarlo",
        body: [
          "Cuando recibís un comprobante de un proveedor y te vas a tomar el crédito fiscal, estás confiando en un documento que no emitiste vos. Verificar el CDC —primero su forma y su dígito verificador, después su estado en SIFEN— es la forma barata de descubrir un problema antes de que forme parte de tu declaración.",
          'El orden importa: un control local que falla vale más que una respuesta de "aprobado", porque un documento puede estar aprobado y aun así no ser el que te están mostrando. Y si SIFEN no responde en ese momento, el resultado honesto es "no verificado", nunca "verificado".',
        ],
      },
    ],
    related: [
      "conciliacion-de-comprobantes",
      "facturacion-electronica-sifen",
      "libros-iva",
    ],
  },
  {
    slug: "formulario-120-como-se-arma",
    title: "Formulario 120: qué declara y cómo se arma",
    metaTitle: "Formulario 120: qué declara y cómo se arma",
    metaDescription:
      "El F. 120 es la declaración mensual de IVA. De dónde sale cada casilla, cómo funciona el saldo a favor y de qué depende la fecha de tu vencimiento.",
    summary:
      "De dónde sale cada casilla de la declaración mensual de IVA, cómo se arrastra el saldo a favor y por qué tu vencimiento no es el mismo que el de tu vecino.",
    published: "2026-08-26",
    readingMinutes: 5,
    sections: [
      {
        heading: "Qué declara",
        body: [
          "El Formulario 120 es la declaración jurada mensual del IVA. En términos simples informa dos cosas y su diferencia: el IVA que cobraste en tus ventas (débito fiscal) y el IVA que pagaste en tus compras vinculadas a la actividad (crédito fiscal).",
          "Si el débito supera al crédito, hay impuesto a pagar. Si el crédito supera al débito, queda un saldo a favor que no se pierde: se arrastra al período siguiente.",
        ],
      },
      {
        heading: "De dónde sale cada casilla",
        body: [
          "Las casillas no se completan de memoria: salen de los libros del período. El libro de ventas alimenta el débito, el libro de compras alimenta el crédito, y ambos se separan por tasa, porque en Paraguay conviven la tasa general del 10 % y la reducida del 5 %.",
          "Por eso el trabajo real de la declaración no ocurre el día del vencimiento, sino durante el mes: un comprobante que no llegó al libro no va a aparecer mágicamente en el formulario.",
        ],
      },
      {
        heading: "El saldo del mes anterior",
        body: [
          "El saldo a favor del período anterior entra en la declaración del período actual. Suena obvio y es una de las fuentes de error más comunes cuando la contabilidad cambia de manos a mitad de año: si el saldo no se arrastra, se paga de más; si se arrastra mal, la diferencia reaparece más adelante.",
          "Cuando tomamos una contabilidad empezada, revisar el saldo declarado en el último período es de las primeras cosas que hacemos, y lo dejamos por escrito.",
        ],
      },
      {
        heading: "Cuándo vence",
        body: [
          "El vencimiento de la declaración mensual no es igual para todos: depende del último dígito de tu RUC, sin contar el dígito verificador, según el calendario perpetuo de DNIT. Dos empresas del mismo rubro y del mismo tamaño pueden tener fechas distintas.",
          "Además, cuando la fecha cae en un día no laborable —feriado o asueto declarado— el vencimiento se corre. Por eso conviene tratar la fecha como un dato a controlar, no como algo que uno recuerda.",
        ],
      },
      {
        heading: "Antes de cerrar",
        body: [
          "Un período que se declara con diferencias adentro es una deuda a plazo. Antes de cerrar vale la pena mirar tres cosas: comprobantes duplicados, comprobantes que faltan y saltos en la numeración de lo que vos mismo emitiste.",
          'Ese último punto solo lo puede revisar quien emite. Si tu numeración salta, la pregunta "¿qué pasó con ese número?" es mejor respondérsela uno mismo.',
        ],
      },
    ],
    related: [
      "declaracion-iva-formulario-120",
      "libros-iva",
      "conciliacion-de-comprobantes",
    ],
  },
  {
    slug: "facturacion-electronica-que-cambia",
    title: "Facturación electrónica: qué cambia para tu empresa",
    metaTitle: "Facturación electrónica: qué cambia en tu empresa",
    metaDescription:
      "Pasar a documentos electrónicos cambia el circuito, no solo el papel: certificado, numeración, estados en SIFEN, KuDE, XML y plazos para corregir.",
    summary:
      "Lo que realmente cambia cuando pasás a emitir electrónicamente: certificado, estados, plazos para corregir y qué tenés que guardar.",
    published: "2026-08-26",
    readingMinutes: 5,
    sections: [
      {
        heading: "No es el mismo papel en PDF",
        body: [
          "La confusión más común es pensar que la factura electrónica es la de siempre, enviada por correo. No lo es. El documento fiscal pasa a ser un archivo XML firmado digitalmente y aprobado por SIFEN; el PDF que le entregás al cliente —el KuDE— es su representación gráfica, no el documento.",
          "Esa distinción parece técnica hasta el día en que necesitás demostrar algo: lo que vale es el XML.",
        ],
      },
      {
        heading: "Vas a necesitar un certificado digital",
        body: [
          "La firma del documento se hace con un certificado digital a nombre del contribuyente. Es tuyo, tiene vencimiento y hay que renovarlo antes de que caduque: un certificado vencido no es una molestia administrativa, es no poder emitir.",
          "Vale la pena tener la fecha de vencimiento controlada en algún lugar que avise solo, no anotada en una agenda.",
        ],
      },
      {
        heading: "El documento tiene estados",
        body: [
          "Emitir deja de ser un acto único. El documento se genera, se firma, se envía y recibe una respuesta: aprobado o rechazado, con un código y un motivo. Un rechazo no se resuelve reimprimiendo; se corrige el dato que SIFEN objetó y se reemite.",
          "También puede pasar que SIFEN no esté disponible en ese momento. Para eso existen los mecanismos de contingencia, y el punto importante es que el documento no se pierde: queda pendiente de envío y se reintenta.",
        ],
      },
      {
        heading: "La numeración deja de perdonar",
        body: [
          "La numeración de los comprobantes es correlativa por punto de expedición y no admite huecos silenciosos. En papel, un talonario mal usado se explicaba; en electrónico, el salto queda registrado.",
          "Es una exigencia mayor y, al mismo tiempo, una ventaja: quien emite puede detectar sus propios huecos antes de que lo haga otro.",
        ],
      },
      {
        heading: "Corregir tiene plazo",
        body: [
          "Un documento electrónico no se borra. Se cancela mediante un evento, y la normativa fija un plazo acotado desde la emisión para hacerlo. Pasado ese plazo, la corrección va por nota de crédito, que es otra operación con otras consecuencias.",
          "En la práctica esto cambia una costumbre: revisar antes de emitir vale mucho más que antes.",
        ],
      },
      {
        heading: "Qué tenés que guardar",
        body: [
          "Los documentos fiscales tienen un plazo de guarda legal, y eso incluye los XML, no solo los PDF. Guardarlos en la carpeta de descargas de una computadora no es un archivo: es un archivo hasta que se rompa esa computadora.",
          "Cuando armamos la emisión de un cliente, el archivo de los XML es parte del circuito desde el primer día, no algo que se resuelve después.",
        ],
      },
    ],
    related: [
      "facturacion-electronica-sifen",
      "contabilidad-mensual",
      "conciliacion-de-comprobantes",
    ],
  },
];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((guide) => guide.slug === slug);
}

export function guidePath(slug: string): string {
  return `/recursos/${slug}`;
}
