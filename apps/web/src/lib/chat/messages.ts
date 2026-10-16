// Chat helpers for the web (B14). Pure, so ordering, receipts and file checks
// are unit-tested; Postgres enforces the same limits in send_message and the
// `chat` bucket policies.
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  isMessageReadBy,
  isChatAttachmentType,
  MAX_MESSAGE_ATTACHMENTS,
  type MessageAttachment,
  type UserRole,
} from '@transport/shared';

/** Messages loaded when a chat opens or catches up (the most recent ones). */
export const CHAT_PAGE_SIZE = 200;

/** Columns of a message row that the chat shows. */
export const MESSAGE_COLUMNS = 'id, sender_id, sender_role, body, attachments, created_at';

export interface ChatMessage {
  id: string;
  sender_id: string;
  sender_role: UserRole;
  body: string | null;
  attachments: MessageAttachment[];
  created_at: string;
}

/** A participant's read marker (message_reads). */
export interface ChatRead {
  user_id: string;
  last_read_at: string;
}

/** Orders two Postgres timestamps to the microsecond (isMessageReadBy is `<=`). */
function compareTimestamps(a: string, b: string): number {
  if (!isMessageReadBy(a, b)) return 1;
  return isMessageReadBy(b, a) ? 0 : -1;
}

/** Adds messages (initial page, Realtime, own sends) without duplicates, oldest first. */
export function mergeMessages(
  current: readonly ChatMessage[],
  incoming: readonly ChatMessage[],
): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.id, m]));
  for (const message of incoming) byId.set(message.id, message);
  // send_message makes the timestamps of a conversation strictly increasing.
  return [...byId.values()].sort(
    (a, b) => compareTimestamps(a.created_at, b.created_at) || a.id.localeCompare(b.id),
  );
}

/** Keeps the furthest marker of each user (markers never move backwards). */
export function mergeReads(
  current: readonly ChatRead[],
  incoming: readonly ChatRead[],
): ChatRead[] {
  const byUser = new Map(current.map((r) => [r.user_id, r]));
  for (const read of incoming) {
    const known = byUser.get(read.user_id);
    if (!known || !isMessageReadBy(read.last_read_at, known.last_read_at)) {
      byUser.set(read.user_id, read);
    }
  }
  return [...byUser.values()];
}

/**
 * Read receipt of a message sent by the viewer's side: read when someone
 * outside the viewer's company has a marker at or after it.
 */
export function isReadByCounterpart(
  message: ChatMessage,
  reads: readonly ChatRead[],
  ownCompanyUserIds: ReadonlySet<string>,
): boolean {
  return reads.some(
    (read) =>
      !ownCompanyUserIds.has(read.user_id) &&
      isMessageReadBy(message.created_at, read.last_read_at),
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

export type AttachmentIssue = 'fileType' | 'fileSize' | 'tooMany';

/** Why a set of files cannot be attached, or null when they can. */
export function attachmentIssue(
  files: readonly { type: string; size: number }[],
): AttachmentIssue | null {
  if (files.length > MAX_MESSAGE_ATTACHMENTS) return 'tooMany';
  for (const file of files) {
    if (!isChatAttachmentType(file.type)) return 'fileType';
    if (file.size <= 0 || file.size > CHAT_ATTACHMENT_MAX_BYTES) return 'fileSize';
  }
  return null;
}
