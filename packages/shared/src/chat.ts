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

/**
 * Whether a participant has read a message, from their `message_reads`
 * marker (read receipts): read when the message is not newer than it.
 */
export function isMessageReadBy(
  messageCreatedAt: string | Date,
  lastReadAt: string | Date | null | undefined,
): boolean {
  if (lastReadAt === null || lastReadAt === undefined) return false;
  return new Date(messageCreatedAt).getTime() <= new Date(lastReadAt).getTime();
}
