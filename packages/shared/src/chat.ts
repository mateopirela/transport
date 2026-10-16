// Chat helpers (B07). Postgres enforces the same limits in `send_message` and
// in the policies of the private `chat` bucket; this module lets the apps
// validate before uploading and show read receipts.

/** Maximum characters of a message body. */
export const MAX_MESSAGE_LENGTH = 4000;

/** Maximum attachments per message. */
export const MAX_MESSAGE_ATTACHMENTS = 5;

/** Maximum size of an attachment (the bucket's file_size_limit). */
export const CHAT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** File types the `chat` bucket accepts, with the extension of their path. */
export const CHAT_ATTACHMENT_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
} as const;

export type ChatAttachmentMimeType = keyof typeof CHAT_ATTACHMENT_TYPES;

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** `{conversation_id}/{uuid}.{ext}`, as the bucket policy and send_message require. */
export const CHAT_ATTACHMENT_PATH = new RegExp(
  `^(${UUID})/${UUID}\\.(jpg|jpeg|png|webp|heic|pdf)$`,
  'u',
);

/** An attachment as `send_message` stores it in `messages.attachments`. */
export interface MessageAttachment {
  path: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
}

export function isChatAttachmentType(mimeType: string): mimeType is ChatAttachmentMimeType {
  return Object.hasOwn(CHAT_ATTACHMENT_TYPES, mimeType);
}

/** Storage path of a new attachment of a conversation; `fileId` is a fresh UUID. */
export function chatAttachmentPath(
  conversationId: string,
  fileId: string,
  mimeType: ChatAttachmentMimeType,
): string {
  const path = `${conversationId.toLowerCase()}/${fileId.toLowerCase()}.${CHAT_ATTACHMENT_TYPES[mimeType]}`;
  if (!CHAT_ATTACHMENT_PATH.test(path)) throw new RangeError('Invalid conversation or file id');
  return path;
}

/** Whether an attachment path belongs to the given conversation. */
export function isAttachmentOfConversation(path: string, conversationId: string): boolean {
  return CHAT_ATTACHMENT_PATH.exec(path)?.[1] === conversationId.toLowerCase();
}

// ISO timestamp as Postgres/PostgREST returns it, with up to microseconds.
const TIMESTAMP = /^(.+T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}(?::?\d{2})?)$/u;

/** Microseconds since the epoch, keeping the precision of Postgres timestamps. */
function epochMicros(value: string | Date): number {
  if (value instanceof Date) return value.getTime() * 1000;
  const match = TIMESTAMP.exec(value);
  // Postgres may print the offset as +00 or +0000; Date.parse needs +00:00.
  const offset = match?.[3]?.replace(/^([+-]\d{2}):?(\d{2})?$/u, (_, h: string, m?: string) => {
    return `${h}:${m ?? '00'}`;
  });
  const seconds = match ? Date.parse(`${match[1]}${offset}`) : Number.NaN;
  if (!match || Number.isNaN(seconds)) throw new RangeError(`Invalid timestamp: ${value}`);
  const fraction = Number((match[2] ?? '').slice(0, 6).padEnd(6, '0'));
  return seconds * 1000 + fraction;
}

/**
 * Whether a participant has read a message, from their `message_reads`
 * marker (read receipts): read when the message is not newer than it.
 * Compares to the microsecond, like Postgres.
 */
export function isMessageReadBy(
  messageCreatedAt: string | Date,
  lastReadAt: string | Date | null | undefined,
): boolean {
  if (lastReadAt === null || lastReadAt === undefined) return false;
  return epochMicros(messageCreatedAt) <= epochMicros(lastReadAt);
}
