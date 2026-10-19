import { describe, expect, it } from 'vitest';

import { DOCUMENT_SHARE_REVOKE_REASONS, PROVIDER_STATUSES } from '../enums';
import {
  documentShareRevokeReasonLabels,
  providerActionLabels,
  providerErrorMessage,
  providerStateLabels,
  revokeShareErrorMessage,
  sharedDocumentsCopy,
} from './shared-documents';

describe('shared documents copy', () => {
  it('labels every provider state, action and revocation reason', () => {
    for (const status of PROVIDER_STATUSES) {
      expect(providerStateLabels[status].trim()).not.toBe('');
      expect(providerActionLabels[status].trim()).not.toBe('');
      expect(sharedDocumentsCopy.provider.saved[status].trim()).not.toBe('');
    }
    expect(providerStateLabels.pending).toBe('Alta pendiente');
    expect(providerStateLabels.approved).toBe('Proveedor aprobado');
    expect(providerActionLabels.approved).toBe('Dar de alta como proveedor');
    for (const reason of DOCUMENT_SHARE_REVOKE_REASONS) {
      expect(documentShareRevokeReasonLabels[reason].trim()).not.toBe('');
    }
  });

  it('names the owner of a shared document', () => {
    expect(sharedDocumentsCopy.owner.vehicle('NLA-1234')).toBe('Unidad NLA-1234');
    expect(sharedDocumentsCopy.owner.vehicle(null)).toBe('Unidad');
    expect(sharedDocumentsCopy.owner.operator('Pedro López')).toBe('Operador: Pedro López');
  });
});

describe('shared documents errors', () => {
  const e = sharedDocumentsCopy.errors;

  it('maps the provider errors without leaking database text', () => {
    expect(providerErrorMessage({ code: '42501', message: 'carrier not found' })).toBe(
      e.notAllowed,
    );
    expect(providerErrorMessage({ code: '55000', message: 'cannot change' })).toBe(e.changed);
    expect(providerErrorMessage({ code: '40001', message: 'changed meanwhile' })).toBe(e.changed);
    expect(providerErrorMessage({ code: '22023', message: 'notes are too long' })).toBe(
      e.notesTooLong,
    );
    expect(providerErrorMessage({ code: '22023', message: 'a status is required' })).toBe(
      e.generic,
    );
    expect(providerErrorMessage(null)).toBe(e.generic);
  });

  it('maps the revocation errors', () => {
    expect(
      revokeShareErrorMessage({
        code: '42501',
        message: 'only the manager revokes a shared document',
      }),
    ).toBe(sharedDocumentsCopy.carrier.managerOnly);
    expect(revokeShareErrorMessage({ code: '42501', message: 'share not found' })).toBe(
      e.shareNotFound,
    );
    expect(revokeShareErrorMessage({ code: 'XX000', message: 'boom' })).toBe(e.generic);
    expect(revokeShareErrorMessage(undefined)).toBe(e.generic);
  });
});
