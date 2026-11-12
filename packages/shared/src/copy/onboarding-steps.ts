// Spanish copy of steps 3, 4 and 5 of the sign-up (D42, plan-registro.md R3):
// the common documents, what each profile adds and "En verificación". The
// step names are the sign-up's (authCopy.signUp.steps), shared with R1 and R2.
import type { OnboardingProfile } from '../onboarding';
import type { RequirementState } from '../verification';

export const onboardingStepsCopy = {
  /** What the steps indicator is of, for a screen reader. */
  label: 'Pasos del alta',
  titles: {
    documents: 'Documentos comunes',
    profile: 'Tu perfil',
    verification: 'En verificación',
  },
  descriptions: {
    documents:
      'Sube la Constancia de Situación Fiscal, la INE del titular o representante legal y, si aplica, el poder o documento de representación.',
    profile: {
      shipper:
        'Si tienes una póliza anual que cubre tu mercancía, súbela aquí. Si no, la pedimos en cada viaje.',
      manager:
        'Organiza tu empresa: crea tus unidades de negocio e invita a tus coordinadores. Puedes hacerlo también después, en Mi empresa.',
      owner_operator:
        'Registra tu camión con sus documentos y, como su operador, sube tu identificación oficial, tu licencia y una selfie.',
      coordinator:
        'Revisa los documentos de los camiones de tus unidades de negocio e invita a tus operadores.',
      operator: 'Sube tu INE, tu licencia vigente y una selfie.',
    } satisfies Record<OnboardingProfile, string>,
    verification:
      'Aquí ves el estado de cada documento y qué hacer con él. Te avisamos cuando revisemos cada uno.',
  },
  /** D47: what the shipper tells about their loads is captured with each load. */
  shipperLoadsNote:
    'Los datos de cada carga (tipo, peso, ruta y horarios) los capturas al publicarla.',
  /** The INE of step 3 is the company's; the operator's own is asked again (R3). */
  sameIdNote:
    'Puede ser la misma INE que subiste en el paso 3: aquí cuenta como tu identificación de operador.',
  /** The selfie (D44): front camera, reviewed by hand next to the id. */
  selfieNote:
    'Tómala de frente, con buena luz y sin lentes oscuros. La revisamos junto con tu identificación.',
  groups: {
    company: 'Documentos de la empresa',
    personal: 'Tus documentos como operador',
    units: 'Tu camión',
    businessUnits: 'Unidades de negocio',
    coordinators: 'Invita a tus coordinadores',
    fleet: 'Camiones y operadores',
  },
  ownerOperator: {
    noUnits: 'Aún no registras tu camión. Regístralo para subir sus documentos.',
    noOperator:
      'No encontramos tu registro como operador. Escríbenos por WhatsApp y lo corregimos.',
  },
  coordinator: {
    units: 'Ver camiones',
    operators: 'Ver operadores e invitarlos',
  },
  operator: {
    open: 'Mis documentos',
    takeSelfie: 'Tomar selfie',
    /** On the trip screen while a required document of the operator needs an upload. */
    pending: 'Te faltan documentos para poder viajar.',
  },
  /** The app's screen of steps 3–5 (R3). */
  app: {
    title: 'Tu alta',
    /** On the home of a company in review: where the steps continue. */
    continue: 'Continuar mi alta',
    finish: 'Ir al inicio',
    myCompany: 'Mi empresa',
    addUnit: 'Registrar mi camión',
  },
  next: 'Siguiente',
  back: 'Regresar',
  /** What to do with each document, next to its state (step 5). */
  nextAction: {
    missing: 'Súbelo para continuar.',
    pending_review: 'Lo estamos revisando.',
    approved: 'Listo.',
    rejected: 'Corrígelo y súbelo de nuevo.',
    expired: 'Venció: sube uno vigente.',
    suspended: 'Escríbenos para revisarlo.',
  } satisfies Record<RequirementState, string>,
  optionalMissing: 'Opcional: súbelo si aplica.',
  summary: {
    title: 'Tu verificación',
    todo: (count: number) =>
      count === 1
        ? 'Te falta subir o corregir 1 documento obligatorio.'
        : `Te falta subir o corregir ${count} documentos obligatorios.`,
    inReview: 'Recibimos todos tus documentos obligatorios. Los estamos revisando.',
    done: 'Todos tus documentos obligatorios están aprobados.',
    counts: (approved: number, total: number) => `${approved} de ${total} aprobados`,
  },
  /** The admin reviews the selfie next to the operator's id (D44). */
  identity: {
    title: 'Identidad del operador',
    hint: 'Compara la selfie con la foto de la identificación antes de aprobarlas.',
    selfie: 'Selfie',
    officialId: 'Identificación oficial',
    missing: 'Sin enviar',
    notAnImage: 'Es un PDF: ábrelo para verlo.',
    imageAlt: (what: string, name: string) => `${what} de ${name}`,
  },
  stepLink: (step: number) => `Ir al paso ${step}`,
  /** The fiscal data form lives in step 5, next to the state of the documents. */
  missingFiscalElsewhere: 'Complétalos en el paso 5, En verificación.',
} as const;
