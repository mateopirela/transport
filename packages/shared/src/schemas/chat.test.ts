import { describe, expect, it } from 'vitest';

import { validationMessages as m } from '../copy/validation';
import { messageAttachmentInputSchema, messageFormSchema } from './chat';

const PATH = '0c7f1c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f/b7000000-0000-4000-8000-000000000001.pdf';
const OTHER = '0c7f1c2e-1a2b-4c3d-8e9f-0a1b2c3d4e5f/b7000000-0000-4000-8000-000000000002.jpg';

describe('message form', () => {
  it('accepts text, attachments or both', () => {
    expect(messageFormSchema.parse({ body: '  Hola  ' })).toEqual({
      body: 'Hola',
      attachments: [],
    });
    expect(
      messageFormSchema.parse({ attachments: [{ path: PATH, name: 'Carta porte.pdf' }] }),
    ).toEqual({ body: undefined, attachments: [{ path: PATH, name: 'Carta porte.pdf' }] });
    expect(
      messageFormSchema.parse({ body: 'Va', attachments: [{ path: PATH }] }).attachments,
    ).toEqual([{ path: PATH, name: undefined }]);
  });

  it('rejects an empty message', () => {
    expect(messageFormSchema.safeParse({ body: '   ' }).error?.issues[0]?.message).toBe(
      m.messageEmpty,
    );
    expect(messageFormSchema.safeParse({}).error?.issues[0]?.message).toBe(m.messageEmpty);
    expect(messageFormSchema.safeParse(null).error?.issues[0]?.message).toBe(m.required);
  });

  it('limits the text to 4000 characters', () => {
    expect(messageFormSchema.safeParse({ body: 'a'.repeat(4000) }).success).toBe(true);
    expect(messageFormSchema.safeParse({ body: 'a'.repeat(4001) }).error?.issues[0]?.message).toBe(
      m.tooLong(4000),
    );
  });

  it('limits attachments to 5 distinct files', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      path: PATH.replace('001.pdf', `00${i}.pdf`),
    }));
    expect(messageFormSchema.safeParse({ attachments: many.slice(0, 5) }).success).toBe(true);
    expect(messageFormSchema.safeParse({ attachments: many }).error?.issues[0]?.message).toBe(
      m.tooManyItems(5),
    );
    expect(
      messageFormSchema.safeParse({ attachments: [{ path: PATH }, { path: PATH }] }).error
        ?.issues[0]?.message,
    ).toBe(m.duplicateItems);
    expect(
      messageFormSchema.safeParse({ attachments: [{ path: PATH }, { path: OTHER }] }).success,
    ).toBe(true);
  });
});

describe('message attachment', () => {
  it('rejects paths outside {conversation}/{uuid}.{ext}', () => {
    for (const path of ['notas.txt', `${PATH}.exe`, PATH.replace('.pdf', '.txt'), 42]) {
      expect(messageAttachmentInputSchema.safeParse({ path }).error?.issues[0]?.message).toBe(
        m.attachment,
      );
    }
    expect(messageAttachmentInputSchema.safeParse('x').error?.issues[0]?.message).toBe(
      m.attachment,
    );
    expect(messageFormSchema.safeParse({ attachments: 'x' }).error?.issues[0]?.message).toBe(
      m.attachment,
    );
  });

  it('limits the file name', () => {
    expect(
      messageAttachmentInputSchema.safeParse({ path: PATH, name: 'a'.repeat(256) }).error?.issues[0]
        ?.message,
    ).toBe(m.tooLong(255));
  });
});
