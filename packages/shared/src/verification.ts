// Verification helpers (B12): which documents apply to an owner, the state of
// each requirement and the rules for uploading a file. Pure, so the web
// onboarding, the admin panel and the mobile app (B18) share one definition.
// Postgres enforces the same rules again (submit_document, review_*).
import { APP_TIME_ZONE } from './constants';
import { Constants, type Tables } from './db';
import type { CompanyType, VerificationStatus } from './enums';

export const DOCUMENT_OWNER_TYPES = Constants.public.Enums.document_owner_type;
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];

export type TaxpayerType = Tables<'document_requirements'>['taxpayer_type'] & string;

/** Mirrors `taxpayer_type_for_rfc` in SQL: 12 characters = moral, else física. */
export function taxpayerTypeForRfc(rfc: string): TaxpayerType {
  return rfc.length === 12 ? 'moral' : 'fisica';
}

export type Requirement = Pick<
  Tables<'document_requirements'>,
  | 'id'
  | 'code'
  | 'name'
  | 'description'
  | 'owner_type'
  | 'company_type'
  | 'taxpayer_type'
  | 'is_required'
  | 'requires_expiry'
  | 'sort_order'
  | 'archived_at'
>;

export type SubmittedDocument = Pick<
  Tables<'documents'>,
  | 'id'
  | 'requirement_id'
  | 'owner_type'
  | 'owner_id'
  | 'status'
  | 'review_notes'
  | 'expires_at'
  | 'created_at'
  | 'archived_at'
  | 'file_name'
>;

/** Active catalog entries that apply to an owner of a company, in display order. */
export function applicableRequirements<R extends Requirement>(
  requirements: readonly R[],
  ownerType: DocumentOwnerType,
  company: { type: CompanyType; rfc: string },
): R[] {
  const taxpayer = taxpayerTypeForRfc(company.rfc);
  return requirements
    .filter(
      (r) =>
        r.archived_at === null &&
        r.owner_type === ownerType &&
        (r.company_type === null || r.company_type === company.type) &&
        // Taxpayer type only narrows company documents (same as SQL).
        (ownerType !== 'company' || r.taxpayer_type === null || r.taxpayer_type === taxpayer),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code));
}

/** What the owner still has to do for a requirement. */
export type RequirementState = 'missing' | VerificationStatus;

export interface RequirementProgress<R extends Requirement, D extends SubmittedDocument> {
  requirement: R;
  /** Latest active submission, if any. */
  document: D | null;
  state: RequirementState;
}

/**
 * State of each requirement for one owner: the latest active document decides
 * it, and an approved document past its expiry date counts as `expired`.
 */
export function requirementProgress<R extends Requirement, D extends SubmittedDocument>(
  requirements: readonly R[],
  documents: readonly D[],
  owner: { type: DocumentOwnerType; id: string },
  now: Date = new Date(),
): RequirementProgress<R, D>[] {
  return requirements.map((requirement) => {
    const document =
      documents
        .filter(
          (d) =>
            d.archived_at === null &&
            d.requirement_id === requirement.id &&
            d.owner_type === owner.type &&
            d.owner_id === owner.id,
        )
        .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0] ?? null;
    let state: RequirementState = document?.status ?? 'missing';
    if (state === 'approved' && document) {
      if (document.expires_at && Date.parse(document.expires_at) <= now.getTime()) {
        state = 'expired';
      } else if (requirement.requires_expiry && !document.expires_at) {
        // The requirement started asking for an expiry date after this
        // approval: SQL no longer counts it (company_missing_requirements),
        // so the owner must send a new one.
        state = 'missing';
      }
    }
    return { requirement, document, state };
  });
}

/** Summary used by the onboarding stepper and the admin queue. */
export function progressSummary(
  progress: readonly { requirement: Requirement; state: RequirementState }[],
): { required: number; approved: number; submitted: number; needsAction: number } {
  const required = progress.filter((p) => p.requirement.is_required);
  return {
    required: required.length,
    approved: required.filter((p) => p.state === 'approved').length,
    // Sent and waiting for the admin, or already approved.
    submitted: required.filter((p) => p.state === 'approved' || p.state === 'pending_review')
      .length,
    // Missing, rejected or expired: the owner must upload (again).
    needsAction: required.filter((p) => !['approved', 'pending_review'].includes(p.state)).length,
  };
}

// ---------------------------------------------------------------------------
// Upload rules: must match the `documents` bucket (B03 migration).
// ---------------------------------------------------------------------------

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export const DOCUMENT_MIME_TYPES = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
} as const satisfies Record<string, string>;

export type DocumentFileIssue = 'empty' | 'tooLarge' | 'type';

/** Why a file cannot be uploaded, or `null` when it is acceptable. */
export function documentFileIssue(file: { size: number; type: string }): DocumentFileIssue | null {
  if (file.size <= 0) return 'empty';
  if (file.size > DOCUMENT_MAX_BYTES) return 'tooLarge';
  if (!Object.hasOwn(DOCUMENT_MIME_TYPES, file.type)) return 'type';
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

/**
 * Object name in the `documents` bucket:
 * `{company_id}/{owner_type}/{owner_id}/{uuid}.{ext}`. The extension comes
 * from the MIME type (never from the user's file name).
 */
export function documentStoragePath(params: {
  companyId: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  fileId: string;
  mimeType: string;
}): string {
  const { companyId, ownerType, ownerId, fileId, mimeType } = params;
  for (const id of [companyId, ownerId, fileId]) {
    if (!UUID.test(id)) throw new RangeError(`Invalid id: ${id}`);
  }
  if (!Object.hasOwn(DOCUMENT_MIME_TYPES, mimeType)) {
    throw new RangeError(`Unsupported document type: ${mimeType}`);
  }
  const ext = DOCUMENT_MIME_TYPES[mimeType as keyof typeof DOCUMENT_MIME_TYPES];
  return `${companyId}/${ownerType}/${ownerId}/${fileId}.${ext}`;
}

/**
 * Expiry dates are picked as calendar days; a document stays valid through
 * the end of that day in Mexico City (UTC-6 all year since 2022).
 */
export function endOfDayInMexicoCity(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  const parsed = match ? new Date(`${date}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Invalid calendar date: ${date}`);
  }
  return `${date}T23:59:59-06:00`;
}

const mexicoCityDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: APP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Calendar day (YYYY-MM-DD) of a timestamp in Mexico City, e.g. for a date input. */
export function toMexicoCityDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid timestamp: ${timestamp}`);
  return mexicoCityDate.format(date);
}

// ---------------------------------------------------------------------------
// Company decisions (mirror review_company in SQL)
// ---------------------------------------------------------------------------

export type CompanyDecision = 'approve' | 'reactivate' | 'reject' | 'suspend';

/** Decisions the admin can take on a company in `status`. */
export function companyDecisions(status: VerificationStatus): CompanyDecision[] {
  switch (status) {
    case 'pending_review':
      return ['approve', 'reject'];
    case 'rejected':
      return ['approve'];
    case 'approved':
      return ['suspend'];
    case 'suspended':
      // Reactivating is an approval (review_company 'approve').
      return ['reactivate'];
    case 'expired':
      return [];
  }
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const AUDIT_IGNORED_FIELDS = new Set(['updated_at']);

/** Top-level fields that changed between the old and new row of an audit entry. */
export function auditChangedFields(oldData: unknown, newData: unknown): string[] {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const before = isRecord(oldData) ? oldData : {};
  const after = isRecord(newData) ? newData : {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter(
      (key) =>
        !AUDIT_IGNORED_FIELDS.has(key) &&
        JSON.stringify(before[key]) !== JSON.stringify(after[key]),
    )
    .sort();
}
