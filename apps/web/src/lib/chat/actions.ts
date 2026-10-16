'use server';

import { chatCopy, messageFormSchema, uuidField, type Json } from '@transport/shared';

import { createClient } from '../supabase/server';
import { MESSAGE_COLUMNS, toChatMessage, type ChatMessage } from './messages';

/**
 * Sends a chat message with send_message, which checks that the caller takes
 * part in the conversation and that each attachment was uploaded by them to
 * its folder. `clientMessageId` makes retries idempotent. Returns the stored
 * message so the sender sees it even without Realtime.
 */
export async function sendMessage(input: {
  conversationId: string;
  clientMessageId: string;
  body?: string;
  attachments?: { path: string; name?: string }[];
}): Promise<{ message?: ChatMessage; error?: string }> {
  const ids = [
    uuidField.safeParse(input.conversationId),
    uuidField.safeParse(input.clientMessageId),
  ];
  const parsed = messageFormSchema.safeParse({
    body: input.body,
    attachments: input.attachments ?? [],
  });
  if (!ids.every((id) => id.success) || !parsed.success) return { error: chatCopy.errors.send };
  const supabase = await createClient();
  if (!supabase) return { error: chatCopy.errors.send };

  const { data: id, error } = await supabase.rpc('send_message', {
    p_conversation_id: input.conversationId,
    p_body: parsed.data.body,
    p_attachments: parsed.data.attachments as unknown as Json,
    p_client_message_id: input.clientMessageId,
  });
  if (error) return { error: chatCopy.errors.send };

  const { data } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  return data ? { message: toChatMessage(data) } : {};
}

/** Marks the conversation as read up to a message (or its latest one). Best effort. */
export async function markConversationRead(conversationId: string, messageId?: string) {
  if (!uuidField.safeParse(conversationId).success) return;
  if (messageId !== undefined && !uuidField.safeParse(messageId).success) return;
  const supabase = await createClient();
  if (!supabase) return;
  await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
    p_message_id: messageId,
  });
}
