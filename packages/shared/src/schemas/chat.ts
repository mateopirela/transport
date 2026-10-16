import { z } from 'zod';

import { CHAT_ATTACHMENT_PATH, MAX_MESSAGE_ATTACHMENTS, MAX_MESSAGE_LENGTH } from '../chat';
import { validationMessages as m } from '../copy/validation';
import { formError, optionalText } from './common';

/** An uploaded file to attach, as `send_message` reads it. */
export const messageAttachmentInputSchema = z.object(
  {
    path: z.string({ error: m.attachment }).regex(CHAT_ATTACHMENT_PATH, { error: m.attachment }),
    name: optionalText(255),
  },
  { error: m.attachment },
);

/** A chat message: text, attachments or both (`send_message`). */
export const messageFormSchema = z
  .object(
    {
      body: optionalText(MAX_MESSAGE_LENGTH),
      attachments: z
        .array(messageAttachmentInputSchema, { error: m.attachment })
        .max(MAX_MESSAGE_ATTACHMENTS, { error: m.tooManyItems(MAX_MESSAGE_ATTACHMENTS) })
        .refine((items) => new Set(items.map((item) => item.path)).size === items.length, {
          error: m.duplicateItems,
        })
        .default([]),
    },
    formError,
  )
  .refine(({ body, attachments }) => body !== undefined || attachments.length > 0, {
    error: m.messageEmpty,
    path: ['body'],
  });

export type MessageFormInput = z.input<typeof messageFormSchema>;
export type MessageFormValues = z.output<typeof messageFormSchema>;
