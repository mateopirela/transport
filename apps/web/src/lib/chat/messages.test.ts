import { describe, expect, it } from 'vitest';

import {
  attachmentIssue,
  isReadByCounterpart,
  mergeMessages,
  mergeReads,
  toAttachments,
  type ChatMessage,
} from './messages';

const ME = '00000000-0000-4000-8000-000000000001';
const COLLEAGUE = '00000000-0000-4000-8000-000000000002';
const CARRIER = '00000000-0000-4000-8000-000000000003';

const message = (id: string, created_at: string, sender_id = ME): ChatMessage => ({
  id,
  sender_id,
  sender_role: sender_id === CARRIER ? 'manager' : 'shipper',
  body: id,
  attachments: [],
  created_at,
});

describe('mergeMessages', () => {
  it('adds without duplicates and orders to the microsecond', () => {
    const a = message('a', '2026-10-15T10:00:00.000001+00:00');
    const b = message('b', '2026-10-15T10:00:00.000002+00:00');
    const c = message('c', '2026-10-15T10:00:01+00:00');
    expect(mergeMessages([c, a], [b, a]).map((m) => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('mergeReads', () => {
  it('keeps the furthest marker of each user', () => {
    const reads = mergeReads(
      [{ user_id: CARRIER, last_read_at: '2026-10-15T10:00:05+00:00' }],
      [
        { user_id: CARRIER, last_read_at: '2026-10-15T10:00:01+00:00' },
        { user_id: COLLEAGUE, last_read_at: '2026-10-15T10:00:02+00:00' },
      ],
    );
    expect(reads).toEqual([
      { user_id: CARRIER, last_read_at: '2026-10-15T10:00:05+00:00' },
      { user_id: COLLEAGUE, last_read_at: '2026-10-15T10:00:02+00:00' },
    ]);
    expect(
      mergeReads(reads, [{ user_id: CARRIER, last_read_at: '2026-10-15T10:00:09+00:00' }])[0],
    ).toEqual({ user_id: CARRIER, last_read_at: '2026-10-15T10:00:09+00:00' });
  });
});

describe('isReadByCounterpart', () => {
  const own = new Set([ME, COLLEAGUE]);
  const sent = message('a', '2026-10-15T10:00:00.5+00:00');

  it('is read only when someone outside the company read up to it', () => {
    expect(
      isReadByCounterpart(
        sent,
        [{ user_id: COLLEAGUE, last_read_at: '2026-10-15T11:00:00+00:00' }],
        own,
      ),
    ).toBe(false);
    expect(
      isReadByCounterpart(
        sent,
        [{ user_id: CARRIER, last_read_at: '2026-10-15T10:00:00+00:00' }],
        own,
      ),
    ).toBe(false);
    expect(
      isReadByCounterpart(
        sent,
        [{ user_id: CARRIER, last_read_at: '2026-10-15T10:00:00.5+00:00' }],
        own,
      ),
    ).toBe(true);
  });
});

describe('toAttachments', () => {
  it('keeps well-formed attachments only', () => {
    expect(
      toAttachments([
        { path: 'c/f.pdf', name: 'Carta.pdf', mimeType: 'application/pdf', sizeBytes: 10 },
        { path: 'c/g.png' },
        { name: 'sin ruta' },
        'basura',
      ]),
    ).toEqual([
      { path: 'c/f.pdf', name: 'Carta.pdf', mimeType: 'application/pdf', sizeBytes: 10 },
      { path: 'c/g.png', name: 'c/g.png', mimeType: null, sizeBytes: null },
    ]);
    expect(toAttachments(null)).toEqual([]);
  });
});

describe('attachmentIssue', () => {
  const pdf = { type: 'application/pdf', size: 1024 };

  it('accepts photos and PDFs within the limits', () => {
    expect(attachmentIssue([pdf, { type: 'image/jpeg', size: 10 * 1024 * 1024 }])).toBeNull();
  });

  it('rejects other types, empty or large files, and more than 5 files', () => {
    expect(attachmentIssue([{ type: 'text/plain', size: 10 }])).toBe('fileType');
    expect(attachmentIssue([{ type: 'image/png', size: 10 * 1024 * 1024 + 1 }])).toBe('fileSize');
    expect(attachmentIssue([{ type: 'image/png', size: 0 }])).toBe('fileSize');
    expect(attachmentIssue(Array.from({ length: 6 }, () => pdf))).toBe('tooMany');
  });
});
