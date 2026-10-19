// Chat helpers (B07). Postgres enforces the same limits in `send_message` and
// in the policies of the private `chat` bucket; this module lets the apps
// validate before uploading and show read receipts. The message merging is
// shared by the web (B14) and the app (B19).
import { chatCopy } from './copy/negotiation';
import type { UserRole } from './enums';

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

/** A message as the chats of the web and the app show it. */
export interface ChatMessage {
  id: string;
  /** Null once the sender's account was deleted (D18): the message stays, anonymized. */
  sender_id: string | null;
  sender_role: UserRole;
  body: string | null;
  attachments: MessageAttachment[];
  created_at: string;
}

/**
 * Who wrote a message, as the chat labels it: "Tú" for the viewer, "Cuenta
 * eliminada" when the sender's account was deleted (D18), or their role.
 */
export function chatSenderLabel(
  message: Pick<ChatMessage, 'sender_id' | 'sender_role'>,
  viewerId: string | null | undefined,
): string {
  if (message.sender_id === null) return chatCopy.deletedAccount;
  if (message.sender_id === viewerId) return chatCopy.you;
  const labels: Record<UserRole, string> = {
    shipper: chatCopy.shipper,
    // To the shipper, the Gerente and the Coordinador both speak for the carrier.
    manager: chatCopy.carrier,
    coordinator: chatCopy.carrier,
    operator: chatCopy.operator,
    admin: chatCopy.admin,
  };
  return labels[message.sender_role];
}

/** Orders two Postgres timestamps to the microsecond (isMessageReadBy is `<=`). */
function compareTimestamps(a: string, b: string): number {
  if (!isMessageReadBy(a, b)) return 1;
  return isMessageReadBy(b, a) ? 0 : -1;
}

/**
 * Adds messages (initial page, Realtime INSERT and UPDATE, catch-up, own
 * sends) without duplicates, oldest first. A message seen again replaces the
 * known copy, except that an anonymized one (D18) stays anonymized: messages
 * are immutable but for that erasure (F6), so a copy with a sender read
 * before it, arriving late, is the older one.
 */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) {
    const known = byId.get(message.id);
    byId.set(message.id, known?.sender_id === null && message.sender_id !== null ? known : message);
  }
  // send_message makes the timestamps of a conversation strictly increasing.
  return [...byId.values()].sort(
    (a, b) => compareTimestamps(a.created_at, b.created_at) || a.id.localeCompare(b.id),
  );
}

/** A message row (query, Realtime or send) as the chat shows it. */
export function toChatMessage(
  row: Omit<ChatMessage, 'attachments'> & { attachments: unknown },
): ChatMessage {
  return {
    id: row.id,
    sender_id: row.sender_id,
    sender_role: row.sender_role,
    body: row.body,
    attachments: toAttachments(row.attachments),
    created_at: row.created_at,
  };
}

/** Normalizes the `attachments` JSON of a message row. */
export function toAttachments(value: unknown): MessageAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) => {
    if (typeof item !== 'object' || item === null) return [];
    const { path, name, mimeType, sizeBytes } = item as Record<string, unknown>;
    if (typeof path !== 'string') return [];
    return [
      {
        path,
        name: typeof name === 'string' ? name : path,
        mimeType: typeof mimeType === 'string' ? mimeType : null,
        sizeBytes: typeof sizeBytes === 'number' ? sizeBytes : null,
      },
    ];
  });
}
