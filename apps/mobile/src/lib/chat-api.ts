import { toChatMessage, type ChatMessage } from '@transport/shared';
import { randomUUID } from 'expo-crypto';

import type { Supabase } from './supabase';

// Chat of a negotiation in the app (B19), over the B07 schema: RLS limits the
// messages to the conversation's participants, writes go through
// send_message / mark_conversation_read, and Realtime delivers new messages
// (it applies the messages select policy to every subscriber), and also
// their anonymization when the sender's account is deleted (D18).

/** Messages loaded when the chat opens (the most recent ones). */
export const CHAT_PAGE_SIZE = 200;

const MESSAGE_COLUMNS = 'id, sender_id, sender_role, body, attachments, created_at';

/** The latest messages of a conversation, oldest first. */
export async function listMessages(client: Supabase, conversationId: string) {
  const { data, error } = await client
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  if (error) throw error;
  return data.map(toChatMessage).reverse();
}

/** Sends a text message; idempotent if retried with the same `clientMessageId`. */
export async function sendMessage(
  client: Supabase,
  conversationId: string,
  body: string,
  clientMessageId: string = randomUUID(),
): Promise<ChatMessage> {
  const { data: id, error } = await client.rpc('send_message', {
    p_conversation_id: conversationId,
    p_body: body,
    p_client_message_id: clientMessageId,
  });
  if (error) throw error;
  const { data, error: readError } = await client
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('id', id)
    .single();
  if (readError) throw readError;
  return toChatMessage(data);
}

/** Marks the conversation read up to its latest message (best effort). */
export async function markRead(client: Supabase, conversationId: string): Promise<void> {
  await client.rpc('mark_conversation_read', { p_conversation_id: conversationId });
}

/**
 * Calls `onMessage` for each new message of the conversation, `onUpdate` for
 * each message changed (only ever anonymized, when its sender's account is
 * deleted: D18), and `onJoin`
 * each time the channel (re)joins: the caller loads the latest messages then,
 * so none sent before the subscription or while disconnected is missed.
 * Returns the unsubscribe function.
 */
export function watchMessages(
  client: Supabase,
  conversationId: string,
  onMessage: (message: ChatMessage) => void,
  onUpdate: (message: ChatMessage) => void,
  onJoin: () => void,
) {
  const filter = `conversation_id=eq.${conversationId}`;
  const toMessage = (row: unknown) => toChatMessage(row as Parameters<typeof toChatMessage>[0]);
  const channel = client
    .channel(`chat:${conversationId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter },
      (payload) => onMessage(toMessage(payload.new)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'messages', filter },
      (payload) => onUpdate(toMessage(payload.new)),
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onJoin();
    });
  return () => void client.removeChannel(channel);
}
