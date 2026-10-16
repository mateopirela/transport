// Chat helpers for the web (B14). Pure, so ordering, receipts and file checks
// are unit-tested; Postgres enforces the same limits in send_message and the
// `chat` bucket policies.
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  isMessageReadBy,
  isChatAttachmentType,
  MAX_MESSAGE_ATTACHMENTS,
  type ChatMessage,
} from '@transport/shared';

// Shared with the app since B19.
export { mergeMessages, toAttachments, toChatMessage, type ChatMessage } from '@transport/shared';

/** Messages loaded when a chat opens or catches up (the most recent ones). */
export const CHAT_PAGE_SIZE = 200;

/** Columns of a message row that the chat shows. */
export const MESSAGE_COLUMNS = 'id, sender_id, sender_role, body, attachments, created_at';

/** A participant's read marker (message_reads). */
export interface ChatRead {
  user_id: string;
  last_read_at: string;
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
