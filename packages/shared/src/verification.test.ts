import { describe, expect, it } from 'vitest';

import {
  companyContactSchema,
  companyReviewSchema,
  documentReviewSchema,
  submitDocumentSchema,
} from './schemas/verification';
import {
  applicableRequirements,
  auditChangedFields,
  companyDecisions,
  documentFileIssue,
  documentStoragePath,
  endOfDayInMexicoCity,
  isRequiredFor,
  progressSummary,
  requirementProgress,
  taxpayerTypeForRfc,
  toMexicoCityDate,
  type Requirement,
  type SubmittedDocument,
} from './verification';

const COMPANY = 'c0000000-0000-4000-8000-00000000000a';
const OTHER = 'c0000000-0000-4000-8000-00000000000b';
const FILE = 'f0000000-0000-4000-8000-000000000001';

function req(code: string, extra: Partial<Requirement> = {}): Requirement {
  return {
    id: `id-${code}`,
    code,
    name: code,
    description: null,
    owner_type: 'company',
    company_type: null,
    taxpayer_type: null,
    is_required: true,
    optional_for: [],
    requires_expiry: false,
    sort_order: 0,
    archived_at: null,
    ...extra,
  };
}

function doc(code: string, extra: Partial<SubmittedDocument> = {}): SubmittedDocument {
  return {
    id: `doc-${code}-${extra.created_at ?? ''}`,
    requirement_id: `id-${code}`,
    owner_type: 'company',
    owner_id: COMPANY,
    status: 'pending_review',
    review_notes: null,
    expires_at: null,
    created_at: '2026-10-01T10:00:00Z',
    archived_at: null,
    file_name: 'a.pdf',
    ...extra,
  };
}

const CATALOG = [
  req('proof_of_address', { sort_order: 40 }),
  req('tax_status_certificate', { sort_order: 10 }),
  req('articles_of_incorporation', { sort_order: 20, taxpayer_type: 'moral' }),
  req('sct_permit', { sort_order: 50, company_type: 'carrier' }),
  req('old_one', { sort_order: 5, archived_at: '2026-01-01T00:00:00Z' }),
  req('vehicle_card', { owner_type: 'vehicle', company_type: 'carrier' }),
];

describe('taxpayerTypeForRfc', () => {
  it('maps 12 characters to moral and 13 to física', () => {
    expect(taxpayerTypeForRfc('ACE010101AB1')).toBe('moral');
    expect(taxpayerTypeForRfc('GOMA800101AB1')).toBe('fisica');
  });
});

describe('applicableRequirements', () => {
  it('filters by owner, company type, taxpayer type and archive, in display order', () => {
    const shipperMoral = applicableRequirements(CATALOG, 'company', {
      type: 'shipper',
      rfc: 'ACE010101AB1',
    });
    expect(shipperMoral.map((r) => r.code)).toEqual([
      'tax_status_certificate',
      'articles_of_incorporation',
      'proof_of_address',
    ]);
    const shipperFisica = applicableRequirements(CATALOG, 'company', {
      type: 'shipper',
      rfc: 'GOMA800101AB1',
    });
    expect(shipperFisica.map((r) => r.code)).toEqual([
      'tax_status_certificate',
      'proof_of_address',
    ]);
    const carrier = applicableRequirements(CATALOG, 'company', {
      type: 'carrier',
      rfc: 'TBE020202CD2',
    });
    expect(carrier.map((r) => r.code)).toContain('sct_permit');
    const vehicle = applicableRequirements(CATALOG, 'vehicle', {
      type: 'carrier',
      rfc: 'GOMA800101AB1',
    });
    expect(vehicle.map((r) => r.code)).toEqual(['vehicle_card']);
  });

  it('resolves is_required for the company type (optional_for, D16)', () => {
    const catalog = [
      req('tax_status_certificate', { sort_order: 10 }),
      req('legal_representative_id', { sort_order: 30, optional_for: ['shipper'] }),
    ];
    const shipper = applicableRequirements(catalog, 'company', {
      type: 'shipper',
      rfc: 'ACE010101AB1',
    });
    expect(shipper.map((r) => [r.code, r.is_required])).toEqual([
      ['tax_status_certificate', true],
      ['legal_representative_id', false],
    ]);
    const carrier = applicableRequirements(catalog, 'company', {
      type: 'carrier',
      rfc: 'TBE020202CD2',
    });
    expect(carrier.map((r) => [r.code, r.is_required])).toEqual([
      ['tax_status_certificate', true],
      ['legal_representative_id', true],
    ]);
    expect(isRequiredFor({ is_required: false, optional_for: [] }, 'carrier')).toBe(false);
    // The optional requirement still counts as sent for the summary, not as required.
    const summary = progressSummary(
      requirementProgress(shipper, [], { type: 'company', id: COMPANY }),
    );
    expect(summary).toEqual({ required: 1, approved: 0, submitted: 0, needsAction: 1 });
  });

  it('breaks sort ties by code', () => {
    const list = applicableRequirements([req('b'), req('a')], 'company', {
      type: 'shipper',
      rfc: 'ACE010101AB1',
    });
    expect(list.map((r) => r.code)).toEqual(['a', 'b']);
  });
});

describe('requirementProgress', () => {
  const owner = { type: 'company' as const, id: COMPANY };
  const now = new Date('2026-10-15T12:00:00Z');
  const requirements = [req('a'), req('b'), req('c'), req('d'), req('e', { is_required: false })];

  it('uses the latest active document of the owner and detects expiry', () => {
    const progress = requirementProgress(
      requirements,
      [
        doc('a', {
          status: 'rejected',
          review_notes: 'Ilegible',
          created_at: '2026-10-01T10:00:00Z',
        }),
        doc('a', { status: 'pending_review', created_at: '2026-10-02T10:00:00Z' }),
        doc('b', { status: 'approved', expires_at: '2026-10-14T00:00:00Z' }),
        doc('c', { status: 'approved', expires_at: '2027-01-01T00:00:00Z' }),
        doc('d', { status: 'approved', archived_at: '2026-10-03T00:00:00Z' }),
        doc('d', { status: 'approved', owner_id: OTHER }),
      ],
      owner,
      now,
    );
    expect(progress.map((p) => p.state)).toEqual([
      'pending_review',
      'expired',
      'approved',
      'missing',
      'missing',
    ]);
    expect(progress[0]?.document?.created_at).toBe('2026-10-02T10:00:00Z');
    expect(progress[3]?.document).toBeNull();
  });

  it('summarizes only the required documents', () => {
    const progress = requirementProgress(
      requirements,
      [
        doc('a', { status: 'approved' }),
        doc('b', { status: 'pending_review' }),
        doc('c', { status: 'rejected', review_notes: 'x' }),
        doc('e', { status: 'approved' }),
      ],
      owner,
      now,
    );
    expect(progressSummary(progress)).toEqual({
      required: 4,
      approved: 1,
      submitted: 2,
      needsAction: 2,
    });
  });

  it('asks for a new document when the requirement now needs an expiry date', () => {
    const [noDate, withDate] = requirementProgress(
      [req('a', { requires_expiry: true }), req('b', { requires_expiry: true })],
      [
        doc('a', { status: 'approved' }),
        doc('b', { status: 'approved', expires_at: '2030-01-01T00:00:00Z' }),
      ],
      owner,
      now,
    );
    expect(noDate?.state).toBe('missing');
    expect(noDate?.document?.status).toBe('approved');
    expect(withDate?.state).toBe('approved');
  });

  it('defaults to the current time', () => {
    const [first] = requirementProgress([req('a')], [doc('a', { status: 'approved' })], owner);
    expect(first?.state).toBe('approved');
  });
});

describe('document files', () => {
  it('accepts PDFs and images up to 10 MB', () => {
    expect(documentFileIssue({ size: 1000, type: 'application/pdf' })).toBeNull();
    expect(documentFileIssue({ size: 10 * 1024 * 1024, type: 'image/heic' })).toBeNull();
  });

  it('rejects empty, large and unsupported files', () => {
    expect(documentFileIssue({ size: 0, type: 'application/pdf' })).toBe('empty');
    expect(documentFileIssue({ size: 10 * 1024 * 1024 + 1, type: 'image/png' })).toBe('tooLarge');
    expect(documentFileIssue({ size: 10, type: 'application/zip' })).toBe('type');
    expect(documentFileIssue({ size: 10, type: 'toString' })).toBe('type');
  });

  it('builds the storage path from ids and the MIME type', () => {
    expect(
      documentStoragePath({
        companyId: COMPANY,
        ownerType: 'company',
        ownerId: COMPANY,
        fileId: FILE,
        mimeType: 'image/jpeg',
      }),
    ).toBe(`${COMPANY}/company/${COMPANY}/${FILE}.jpg`);
  });

  it('refuses invalid ids and types in the storage path', () => {
    const base = {
      companyId: COMPANY,
      ownerType: 'company' as const,
      ownerId: COMPANY,
      fileId: FILE,
      mimeType: 'application/pdf',
    };
    expect(() => documentStoragePath({ ...base, ownerId: '../x' })).toThrow(RangeError);
    expect(() => documentStoragePath({ ...base, mimeType: 'text/html' })).toThrow(RangeError);
  });
});

describe('endOfDayInMexicoCity', () => {
  it('returns the last second of the day in Mexico City', () => {
    expect(endOfDayInMexicoCity('2027-03-31')).toBe('2027-03-31T23:59:59-06:00');
    expect(new Date(endOfDayInMexicoCity('2027-03-31')).toISOString()).toBe(
      '2027-04-01T05:59:59.000Z',
    );
  });

  it('rejects impossible or malformed dates', () => {
    expect(() => endOfDayInMexicoCity('2027-02-30')).toThrow(RangeError);
    expect(() => endOfDayInMexicoCity('31/03/2027')).toThrow(RangeError);
  });

  it('round-trips through toMexicoCityDate', () => {
    expect(toMexicoCityDate(endOfDayInMexicoCity('2027-03-31'))).toBe('2027-03-31');
    // 03:00 UTC is still the previous day in Mexico City.
    expect(toMexicoCityDate('2027-04-01T03:00:00Z')).toBe('2027-03-31');
    expect(() => toMexicoCityDate('nope')).toThrow(RangeError);
  });
});

describe('auditChangedFields', () => {
  it('lists changed top-level fields, ignoring updated_at', () => {
    expect(
      auditChangedFields(
        { status: 'pending_review', status_reason: null, updated_at: 'a', rfc: 'X' },
        { status: 'approved', status_reason: null, updated_at: 'b', rfc: 'X' },
      ),
    ).toEqual(['status']);
  });

  it('handles inserts, deletes and non-object data', () => {
    expect(auditChangedFields(null, { b: 1, a: 2 })).toEqual(['a', 'b']);
    expect(auditChangedFields({ a: 1 }, null)).toEqual(['a']);
    expect(auditChangedFields([1], 'x')).toEqual([]);
  });
});

describe('companyDecisions', () => {
  it('mirrors the transitions allowed by review_company', () => {
    expect(companyDecisions('pending_review')).toEqual(['approve', 'reject']);
    expect(companyDecisions('rejected')).toEqual(['approve']);
    expect(companyDecisions('approved')).toEqual(['suspend']);
    expect(companyDecisions('suspended')).toEqual(['reactivate']);
    expect(companyDecisions('expired')).toEqual([]);
  });
});

describe('verification schemas', () => {
  const documentId = FILE;

  it('requires a reason to reject a document', () => {
    expect(documentReviewSchema.safeParse({ documentId, decision: 'reject' }).success).toBe(false);
    expect(
      documentReviewSchema.safeParse({ documentId, decision: 'reject', notes: 'Ilegible' }).success,
    ).toBe(true);
    const approved = documentReviewSchema.parse({
      documentId,
      decision: 'approve',
      expiresOn: '2027-01-31',
    });
    expect(approved.expiresOn).toBe('2027-01-31');
    expect(
      documentReviewSchema.safeParse({ documentId, decision: 'approve', expiresOn: '2027-02-30' })
        .success,
    ).toBe(false);
  });

  it('requires a reason to reject or suspend a company, not to approve', () => {
    const companyId = COMPANY;
    expect(companyReviewSchema.safeParse({ companyId, decision: 'approve' }).success).toBe(true);
    expect(companyReviewSchema.safeParse({ companyId, decision: 'suspend' }).success).toBe(false);
    expect(
      companyReviewSchema.safeParse({ companyId, decision: 'reject', notes: ' ' }).success,
    ).toBe(false);
    expect(
      companyReviewSchema.safeParse({ companyId, decision: 'suspend', notes: 'Fraude' }).success,
    ).toBe(true);
    expect(companyReviewSchema.safeParse({ companyId, decision: 'delete' }).success).toBe(false);
  });

  it('validates and normalizes the company contact', () => {
    const valid = {
      legalName: '  Distribuidora del Norte SA de CV ',
      contactName: 'Laura Martínez',
      contactEmail: ' Laura@Ejemplo.MX ',
      contactPhone: '+52 (81) 1234-5678',
    };
    expect(companyContactSchema.parse(valid)).toEqual({
      legalName: 'Distribuidora del Norte SA de CV',
      contactName: 'Laura Martínez',
      contactEmail: 'laura@ejemplo.mx',
      contactPhone: '8112345678',
    });
    const errors = (input: Record<string, unknown>) => {
      const result = companyContactSchema.safeParse(input);
      return result.success
        ? {}
        : Object.fromEntries(result.error.issues.map((i) => [i.path[0], i.message]));
    };
    expect(errors({ ...valid, legalName: '   ' })).toEqual({
      legalName: 'Este campo es obligatorio.',
    });
    expect(errors({ ...valid, contactName: undefined })).toHaveProperty('contactName');
    expect(errors({ ...valid, contactEmail: 'laura@' })).toHaveProperty('contactEmail');
    expect(errors({ ...valid, contactPhone: '12345' })).toHaveProperty('contactPhone');
    expect(errors({ ...valid, legalName: 'x'.repeat(201) })).toEqual({
      legalName: 'Máximo 200 caracteres.',
    });
    expect(errors({ ...valid, contactName: 'x'.repeat(121) })).toHaveProperty('contactName');
    expect(companyContactSchema.safeParse(null).success).toBe(false);
  });

  it('validates a document submission', () => {
    const valid = {
      requirementId: FILE,
      ownerType: 'company',
      ownerId: COMPANY,
      storagePath: `${COMPANY}/company/${COMPANY}/${FILE}.pdf`,
    };
    expect(submitDocumentSchema.safeParse(valid).success).toBe(true);
    expect(submitDocumentSchema.safeParse({ ...valid, ownerType: 'trip' }).success).toBe(false);
  });
});
