import { describe, expect, it } from 'vitest';

import {
  CHAT_ATTACHMENT_PATH,
  chatAttachmentPath,
  chatSenderLabel,
  isAttachmentOfConversation,
  isChatAttachmentType,
  isMessageReadBy,
} from './chat';

const CONVERSATION = '0c7f1c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const FILE = 'b7000000-0000-4000-8000-000000000001';

describe('chat attachments', () => {
  it('accepts only the file types of the chat bucket', () => {
    expect(isChatAttachmentType('application/pdf')).toBe(true);
    expect(isChatAttachmentType('image/heic')).toBe(true);
    expect(isChatAttachmentType('text/plain')).toBe(false);
    expect(isChatAttachmentType('toString')).toBe(false);
  });

  it('builds the path the bucket policy and send_message expect', () => {
    const path = chatAttachmentPath(CONVERSATION.toUpperCase(), FILE, 'image/jpeg');
    expect(path).toBe(`${CONVERSATION}/${FILE}.jpg`);
    expect(CHAT_ATTACHMENT_PATH.test(path)).toBe(true);
    expect(chatAttachmentPath(CONVERSATION, FILE, 'application/pdf')).toBe(
      `${CONVERSATION}/${FILE}.pdf`,
    );
  });

  it('rejects ids that are not UUIDs', () => {
    expect(() => chatAttachmentPath('../otro', FILE, 'image/png')).toThrow(RangeError);
    expect(() => chatAttachmentPath(CONVERSATION, 'archivo', 'image/png')).toThrow(RangeError);
  });

  it('tells whether a path belongs to a conversation', () => {
    const path = `${CONVERSATION}/${FILE}.png`;
    expect(isAttachmentOfConversation(path, CONVERSATION)).toBe(true);
    expect(isAttachmentOfConversation(path, FILE)).toBe(false);
    expect(isAttachmentOfConversation(`${CONVERSATION}/notas.txt`, CONVERSATION)).toBe(false);
  });
});

describe('read receipts', () => {
  it('reads a message up to the participant marker', () => {
    const at = '2026-11-02T10:00:00.000Z';
    expect(isMessageReadBy(at, at)).toBe(true);
    expect(isMessageReadBy(at, '2026-11-02T10:05:00.000Z')).toBe(true);
    expect(isMessageReadBy(new Date('2026-11-02T10:06:00.000Z'), '2026-11-02T10:05:00Z')).toBe(
      false,
    );
  });

  it('compares to the microsecond, like Postgres', () => {
    const marker = '2026-11-02T10:00:00.123456+00:00';
    expect(isMessageReadBy('2026-11-02T10:00:00.1235+00:00', marker)).toBe(false);
    expect(isMessageReadBy('2026-11-02T10:00:00.123456+00:00', marker)).toBe(true);
    expect(isMessageReadBy('2026-11-02T04:00:00.123455-06:00', marker)).toBe(true);
    expect(isMessageReadBy('2026-11-02T10:00:00+00', '2026-11-02T10:00:00.000001Z')).toBe(true);
  });

  it('rejects malformed timestamps', () => {
    expect(() => isMessageReadBy('ayer', '2026-11-02T10:00:00Z')).toThrow(RangeError);
    expect(() => isMessageReadBy('2026-13-45T10:00:00Z', '2026-11-02T10:00:00Z')).toThrow(
      RangeError,
    );
  });

  it('treats a participant without marker as unread', () => {
    expect(isMessageReadBy('2026-11-02T10:00:00Z', null)).toBe(false);
    expect(isMessageReadBy('2026-11-02T10:00:00Z', undefined)).toBe(false);
  });
});

describe('chatSenderLabel', () => {
  const ME = 'a7000000-0000-4000-8000-000000000001';
  const OTHER = 'a7000000-0000-4000-8000-000000000002';

  it('labels the viewer, the other roles and a deleted account', () => {
    expect(chatSenderLabel({ sender_id: ME, sender_role: 'shipper' }, ME)).toBe('Tú');
    expect(chatSenderLabel({ sender_id: OTHER, sender_role: 'carrier' }, ME)).toBe('Transportista');
    expect(chatSenderLabel({ sender_id: OTHER, sender_role: 'operator' }, ME)).toBe('Operador');
    expect(chatSenderLabel({ sender_id: null, sender_role: 'carrier' }, ME)).toBe(
      'Cuenta eliminada',
    );
  });

  it('never takes a message without a sender as the viewer’s', () => {
    expect(chatSenderLabel({ sender_id: null, sender_role: 'shipper' }, null)).toBe(
      'Cuenta eliminada',
    );
    expect(chatSenderLabel({ sender_id: null, sender_role: 'shipper' }, undefined)).toBe(
      'Cuenta eliminada',
    );
  });
});
