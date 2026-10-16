import 'server-only';

import type { Supabase } from '../viewer';
import { toAttachments, type ChatMessage, type ChatRead } from './messages';

/** Messages shown when a chat opens (the most recent ones). */
export const CHAT_PAGE_SIZE = 200;

/**
 * A conversation's latest messages, the participants' read markers and the
 * viewer's own company users (to tell the counterpart's receipts apart). RLS
 * limits all of it to participants and admins.
 */
export async function getChat(supabase: Supabase, conversationId: string, companyId: string) {
  const [messages, reads, colleagues] = await Promise.all([
    supabase
      .from('messages')
      .select('id, sender_id, sender_role, body, attachments, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(CHAT_PAGE_SIZE),
    supabase
      .from('message_reads')
      .select('user_id, last_read_at')
      .eq('conversation_id', conversationId),
    supabase.from('profiles').select('id').eq('company_id', companyId),
  ]);
  if (messages.error) throw new Error(`Messages query failed: ${messages.error.message}`);
  if (reads.error) throw new Error(`Reads query failed: ${reads.error.message}`);
  if (colleagues.error) throw new Error(`Profiles query failed: ${colleagues.error.message}`);

  return {
    messages: messages.data
      .map((m): ChatMessage => ({ ...m, attachments: toAttachments(m.attachments) }))
      .reverse(),
    reads: reads.data satisfies ChatRead[],
    ownCompanyUserIds: colleagues.data.map((p) => p.id),
  };
}
