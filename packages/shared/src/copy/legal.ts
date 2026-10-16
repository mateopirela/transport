// Privacy notice (LFPDPPP) and terms of use (B27). DRAFTS pending legal
// review: the bracketed placeholders ([...]) are filled in by the company's
// lawyer before launch, and `draft` is set to false only then. The location
// section repeats what the operator accepts in the app (locationConsentCopy,
// B22): change both together.

export interface LegalSection {
  title: string;
  paragraphs: readonly string[];
  items?: readonly string[];
}

export interface LegalText {
  title: string;
  /** Shown on the page; bump it whenever the text changes. */
  version: string;
  /** True until the lawyer approves the text: the page shows a draft banner. */
  draft: boolean;
  intro: string;
  sections: readonly LegalSection[];
}

export const legalCopy = {
  privacyLink: 'Aviso de privacidad',
  termsLink: 'Términos y condiciones',
  draftBanner:
    'Borrador pendiente de revisión legal. Este texto puede cambiar antes del lanzamiento y aún no es la versión definitiva.',
  version: (version: string) => `Versión: ${version}`,
  signUpConsent: {
    before: 'Al crear tu cuenta aceptas los',
    middle: 'y confirmas que leíste el',
    after: '.',
  },
} as const;

export const privacyNotice: LegalText = {
  title: 'Aviso de privacidad integral',
  version: '0.1 (borrador, octubre 2026)',
  draft: true,
  intro:
    '[RAZÓN SOCIAL DEL RESPONSABLE], con domicilio en [DOMICILIO COMPLETO], es responsable del tratamiento de tus datos personales en la plataforma Transport (aplicación móvil y sitio web), conforme a la Ley Federal de Protección de Datos Personales en Posesión de los Particulares.',
  sections: [
    {
      title: 'Datos personales que tratamos',
      paragraphs: [
        'No solicitamos datos personales sensibles. Te pedimos no subir documentos ni mensajes con información de salud, creencias u otros datos sensibles.',
      ],
      items: [
        'Identificación y contacto: nombre, correo electrónico y teléfono.',
        'De la empresa: razón social, RFC y datos de contacto.',
        'Documentos de verificación: actas, constancias, permisos, pólizas, licencias de conducir y documentos de las unidades.',
        'De la operación: cargas, ofertas, viajes, eventos del viaje con fecha, hora y ubicación, fotos de evidencia con sus metadatos, incidencias y mensajes del chat.',
        'Ubicación del operador: solo durante un viaje activo y con su consentimiento expreso.',
        'Del dispositivo y del uso: tipo de teléfono, token de notificaciones, eventos de uso y reportes de errores sin datos de contacto ni ubicación.',
      ],
    },
    {
      title: 'Finalidades',
      paragraphs: [
        'Finalidades necesarias para el servicio: crear y verificar tu cuenta y tu empresa; publicar cargas, negociar y contratar viajes; dar seguimiento a los viajes, estimar llegadas y atender incidencias y la seguridad de la carga; enviarte avisos de la operación; conservar el chat y las evidencias como respaldo de lo acordado; atender soporte y cumplir obligaciones legales.',
        'Finalidades secundarias: medir el uso de la plataforma para mejorarla y, con datos de viajes sin identificar a las personas, desarrollar funciones de estimación de disponibilidad. Puedes oponerte a estas finalidades escribiendo a [CORREO DE PRIVACIDAD]; tu negativa no afecta el servicio.',
        'Tus datos no se venden ni se usan con fines publicitarios.',
      ],
    },
    {
      title: 'Ubicación durante los viajes',
      paragraphs: [
        'La app del operador comparte su ubicación en segundo plano solo durante un viaje activo: empieza al registrar la salida a recoger y termina al registrar la entrega. La ven su transportista y el equipo de soporte; el cliente de la carga, solo mientras el viaje está activo. La aceptación queda registrada con la fecha, la versión del texto y el tipo de teléfono, y puede retirarse en cualquier momento desde la app.',
      ],
    },
    {
      title: 'Con quién compartimos tus datos',
      paragraphs: [
        'Entre las partes de un viaje: el cliente y el transportista ven los datos necesarios para negociar y cumplir el viaje (empresa, contacto, unidad, operador, eventos, evidencias y ubicación mientras el viaje está activo). Esta transferencia es necesaria para cumplir la relación que solicitas, por lo que no requiere un consentimiento adicional.',
        'Con autoridades competentes, cuando una ley o una orden lo exija.',
        'Con proveedores que tratan datos por nuestra cuenta (encargados), con obligaciones de confidencialidad: alojamiento y base de datos, envío de notificaciones y correos, mapas y cálculo de rutas, y reporte de errores. Algunos están fuera de México. Lista vigente: [LISTA DE PROVEEDORES].',
      ],
    },
    {
      title: 'Derechos ARCO y revocación del consentimiento',
      paragraphs: [
        'Puedes acceder a tus datos, rectificarlos, cancelarlos u oponerte a su tratamiento, así como revocar tu consentimiento o limitar el uso de tus datos, enviando una solicitud a [CORREO DE PRIVACIDAD] con tu nombre, un medio para responderte, una identificación y la descripción de lo que pides. Responderemos en los plazos que marca la ley. Si no estás conforme con la respuesta, puedes acudir a la autoridad garante de protección de datos personales.',
        'Algunos datos deben conservarse aunque canceles tu cuenta, por ejemplo los de viajes realizados, mientras lo exijan las leyes fiscales y mercantiles.',
      ],
    },
    {
      title: 'Cookies y tecnologías similares',
      paragraphs: [
        'El sitio web usa cookies propias solo para mantener tu sesión iniciada. No usamos cookies de publicidad.',
      ],
    },
    {
      title: 'Cambios a este aviso',
      paragraphs: [
        'Cualquier cambio se publicará en esta página con una nueva versión y, si es relevante, te lo avisaremos en la app o por correo.',
      ],
    },
  ],
};

export const termsOfService: LegalText = {
  title: 'Términos y condiciones de uso',
  version: '0.1 (borrador, octubre 2026)',
  draft: true,
  intro:
    'Estos términos regulan el uso de la plataforma Transport, operada por [RAZÓN SOCIAL DEL RESPONSABLE]. Al crear una cuenta los aceptas en nombre propio y de la empresa que representas.',
  sections: [
    {
      title: 'Qué es la plataforma',
      paragraphs: [
        'Transport conecta a empresas que necesitan mover carga (clientes) con empresas de autotransporte (transportistas) y sus operadores. La plataforma no presta el servicio de transporte ni es parte del contrato de transporte: el servicio lo presta el transportista que el cliente contrata.',
      ],
    },
    {
      title: 'Cuentas y verificación',
      paragraphs: [
        'Cada empresa debe registrarse con datos verdaderos y subir los documentos que se le pidan. El equipo de la plataforma revisa la información; mientras la cuenta está en revisión no se pueden publicar cargas ni ofertar. Eres responsable de cuidar tu contraseña y de lo que se haga con tu cuenta.',
      ],
    },
    {
      title: 'Obligaciones del cliente',
      paragraphs: [],
      items: [
        'Describir con veracidad la mercancía, su peso, volumen, ventanas y requisitos.',
        'Publicar solo mercancía lícita y declarar cualquier condición especial de manejo.',
        'Confirmar la entrega y reportar incidencias en la plataforma.',
      ],
    },
    {
      title: 'Obligaciones del transportista y del operador',
      paragraphs: [],
      items: [
        'Contar con los permisos, seguros y licencias vigentes que exige la ley, y mantener al día sus documentos en la plataforma.',
        'Emitir y portar la Carta Porte y demás documentos del viaje. La plataforma solo los almacena; no los emite ni los valida.',
        'Registrar los eventos del viaje y las evidencias de recolección y entrega.',
      ],
    },
    {
      title: 'Precios y pagos',
      paragraphs: [
        'El precio de cada viaje lo acuerdan el cliente y el transportista en la plataforma, en pesos mexicanos. El pago se hace fuera de la plataforma, directamente entre ellos; la plataforma solo registra el precio acordado. [CONDICIONES COMERCIALES DE LA PLATAFORMA, SI LAS HAY].',
      ],
    },
    {
      title: 'Comunicación y evidencias',
      paragraphs: [
        'La comunicación entre las partes se hace por el chat de la plataforma. Los mensajes, los eventos del viaje y las evidencias no se pueden modificar y se conservan como respaldo de lo acordado.',
      ],
    },
    {
      title: 'Responsabilidad',
      paragraphs: [
        'La plataforma se ofrece en etapa piloto. Hacemos esfuerzos razonables para que funcione sin interrupciones, pero no garantizamos su disponibilidad continua. La responsabilidad por la mercancía, el transporte y el pago corresponde a las partes del viaje, conforme a lo que acuerden y a la ley.',
      ],
    },
    {
      title: 'Suspensión de cuentas',
      paragraphs: [
        'Podemos suspender una cuenta que dé información falsa, tenga documentos vencidos o use la plataforma de forma contraria a estos términos o a la ley.',
      ],
    },
    {
      title: 'Datos personales',
      paragraphs: [
        'El tratamiento de datos personales se rige por el Aviso de privacidad, disponible en este mismo sitio.',
      ],
    },
    {
      title: 'Cambios, ley aplicable y contacto',
      paragraphs: [
        'Si cambiamos estos términos publicaremos la nueva versión y te la avisaremos. Se rigen por las leyes de los Estados Unidos Mexicanos; para cualquier controversia las partes se someten a los tribunales de [CIUDAD Y ESTADO]. Contacto: [CORREO DE CONTACTO].',
      ],
    },
  ],
};
