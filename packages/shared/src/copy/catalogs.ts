// Spanish labels for every domain enum (D02). Typed as exhaustive records, so
// adding a value to ./enums.ts without a label is a compile error.
import type {
  CargoType,
  CompanyType,
  EvidenceStage,
  IncidentKind,
  IncidentStatus,
  LicenseType,
  LoadStatus,
  OfferSide,
  OfferStatus,
  SpecialRequirement,
  TripDocumentKind,
  TripEventType,
  TripStatus,
  UnitType,
  UserRole,
  VehicleKind,
  VerificationStatus,
} from '../enums';

export const companyTypeLabels: Record<CompanyType, string> = {
  shipper: 'Cliente',
  carrier: 'Transportista',
};

export const userRoleLabels: Record<UserRole, string> = {
  shipper: 'Cliente',
  manager: 'Gerente',
  coordinator: 'Coordinador',
  operator: 'Operador',
  admin: 'Administrador',
};

export const verificationStatusLabels: Record<VerificationStatus, string> = {
  pending_review: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  expired: 'Vencido',
  suspended: 'Suspendido',
};

export const loadStatusLabels: Record<LoadStatus, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  negotiating: 'En negociación',
  contracted: 'Contratada',
  in_progress: 'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
  expired: 'Vencida',
};

export const offerStatusLabels: Record<OfferStatus, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptada',
  rejected: 'Rechazada',
  countered: 'Contraofertada',
  withdrawn: 'Retirada',
  expired: 'Vencida',
};

export const offerSideLabels: Record<OfferSide, string> = {
  shipper: 'Cliente',
  carrier: 'Transportista',
};

export const tripStatusLabels: Record<TripStatus, string> = {
  pending_assignment: 'Por asignar',
  assigned: 'Asignado',
  en_route_to_pickup: 'En camino a recolección',
  at_pickup: 'En recolección',
  loading: 'Cargando',
  in_transit: 'En tránsito',
  at_delivery: 'En destino',
  unloading: 'Descargando',
  delivered: 'Entregado',
  closed: 'Cerrado',
  cancelled: 'Cancelado',
};

export const tripEventTypeLabels: Record<TripEventType, string> = {
  created: 'Viaje creado',
  assigned: 'Unidad y operador asignados',
  departed: 'Salida',
  arrived_at_pickup: 'Llegada a recolección',
  loading_started: 'Inicio de carga',
  loading_finished: 'Fin de carga',
  arrived_at_delivery: 'Llegada a destino',
  unloading_started: 'Inicio de descarga',
  unloading_finished: 'Fin de descarga',
  delivery_confirmed: 'Entrega confirmada',
  cancelled: 'Viaje cancelado',
  unload_estimate_updated: 'Fin estimado de descarga actualizado',
  incident_reported: 'Incidencia reportada',
  incident_resolved: 'Incidencia resuelta',
};

export const evidenceStageLabels: Record<EvidenceStage, string> = {
  pickup: 'Recolección',
  delivery: 'Entrega',
  incident: 'Incidencia',
};

export const incidentKindLabels: Record<IncidentKind, string> = {
  delay: 'Retraso',
  mechanical_failure: 'Falla mecánica',
  accident: 'Accidente',
  cargo_damage: 'Daño a la mercancía',
  theft: 'Robo',
  road_blockade: 'Bloqueo de carretera',
  other: 'Otra',
};

export const incidentStatusLabels: Record<IncidentStatus, string> = {
  open: 'Abierta',
  resolved: 'Resuelta',
};

export const tripDocumentKindLabels: Record<TripDocumentKind, string> = {
  carta_porte: 'Carta Porte',
  other: 'Otro documento',
};

export const vehicleKindLabels: Record<VehicleKind, string> = {
  tractor: 'Tractocamión',
  rigid: 'Camión unitario',
  trailer: 'Remolque',
};

export const unitTypeLabels: Record<UnitType, string> = {
  dry_van: 'Caja seca',
  refrigerated: 'Caja refrigerada',
  flatbed: 'Plataforma',
  lowboy: 'Lowboy (cama baja)',
  hopper: 'Tolva',
  tanker: 'Pipa / tanque',
  container_chassis: 'Portacontenedor',
  cage: 'Jaula',
  stake_bed: 'Redilas',
  torton: 'Tórton',
  rabon: 'Rabón',
  pickup_3_5t: 'Camioneta 3.5 t',
};

export const cargoTypeLabels: Record<CargoType, string> = {
  general: 'Carga general',
  palletized: 'Carga paletizada',
  perishable: 'Perecederos',
  dry_bulk: 'Granel sólido',
  liquid_bulk: 'Granel líquido',
  hazardous: 'Materiales peligrosos',
  oversized: 'Carga sobredimensionada',
  containerized: 'Contenedor',
  vehicles: 'Vehículos',
  construction_materials: 'Materiales de construcción',
  livestock: 'Ganado',
};

export const specialRequirementLabels: Record<SpecialRequirement, string> = {
  temperature_control: 'Temperatura controlada',
  hazmat_permit: 'Permiso para materiales peligrosos',
  liftgate: 'Rampa hidráulica',
  tarp: 'Lona',
  cargo_securing: 'Equipo de sujeción (bandas, cadenas)',
  security_escort: 'Custodia',
  team_drivers: 'Doble operador',
  extended_cargo_insurance: 'Seguro de carga ampliado',
  loading_crew: 'Maniobras de carga y descarga',
};

export const licenseTypeLabels: Record<LicenseType, string> = {
  B: 'Tipo B: carga general',
  C: 'Tipo C: camión unitario de 2 o 3 ejes',
  E: 'Tipo E: carga especializada y materiales peligrosos',
};

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

/** Turns a label record into select options, in the order of `values`. */
export function toOptions<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): SelectOption<T>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}
