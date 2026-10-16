import {
  carrierLoadsCopy,
  chatCopy,
  chatSenderLabel,
  formatDateTime,
  MAX_MESSAGE_LENGTH,
  mergeMessages,
  type ChatMessage,
} from '@transport/shared';
import { randomUUID } from 'expo-crypto';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { listMessages, markRead, sendMessage, watchMessages } from '../lib/chat-api';
import type { Supabase } from '../lib/supabase';
import { useSession } from '../providers/session';
import { colors, spacing } from '../theme';
import { Body, Button, Field, Notice } from './ui';

/**
 * Chat of a negotiation (B07 schema): the latest messages, new ones in real
 * time, and text messages sent with send_message. Opening it or receiving a
 * message marks the conversation as read.
 */
export function ChatPanel({
  client,
  conversationId,
}: {
  client: Supabase;
  conversationId: string;
}) {
  const { session } = useSession();
  const userId = session?.user.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  // Kept until the send succeeds, so a retry is idempotent (send_message).
  const pendingId = useRef<string | null>(null);

  const add = useCallback(
    (incoming: ChatMessage[]) => {
      setMessages((current) => mergeMessages(current, incoming));
      void markRead(client, conversationId).catch(() => undefined);
    },
    [client, conversationId],
  );

  useEffect(() => {
    let active = true;
    const load = () =>
      listMessages(client, conversationId)
        .then((page) => {
          if (!active) return;
          setLoadFailed(false);
          add(page);
        })
        .catch(() => active && setLoadFailed(true));
    // Loads now, and again each time Realtime (re)joins: messages sent before
    // the subscription or while disconnected are merged without duplicates.
    const unsubscribe = watchMessages(
      client,
      conversationId,
      (m) => add([m]),
      () => void load(),
    );
    void load();
    return () => {
      active = false;
      unsubscribe();
    };
  }, [client, conversationId, add]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setSendFailed(false);
    pendingId.current ??= randomUUID();
    try {
      const message = await sendMessage(client, conversationId, body, pendingId.current);
      pendingId.current = null;
      setDraft('');
      add([message]);
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.panel}>
      <Body>{chatCopy.description}</Body>
      {loadFailed ? <Notice tone="danger">{carrierLoadsCopy.errors.generic}</Notice> : null}
      {messages.length === 0 && !loadFailed ? <Body>{chatCopy.empty}</Body> : null}
      {messages.map((m) => {
        // A message without a sender (deleted account, D18) is never the viewer's.
        const own = m.sender_id !== null && m.sender_id === userId;
        return (
          <View key={m.id} style={[styles.bubble, own ? styles.own : styles.theirs]}>
            <Text style={styles.meta}>
              {`${chatSenderLabel(m, userId)} · ${formatDateTime(m.created_at)}`}
            </Text>
            {m.body ? <Text style={styles.body}>{m.body}</Text> : null}
            {m.attachments.length > 0 ? (
              <Text style={styles.meta}>
                {carrierLoadsCopy.chat.attachments(m.attachments.length)}
              </Text>
            ) : null}
          </View>
        );
      })}
      {sendFailed ? <Notice tone="danger">{chatCopy.errors.send}</Notice> : null}
      <Field
        label={chatCopy.title}
        placeholder={chatCopy.placeholder}
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          // A different text is a different message.
          pendingId.current = null;
        }}
        maxLength={MAX_MESSAGE_LENGTH}
        multiline
        // Locked while sending: the sent text is the one cleared afterwards.
        editable={!sending}
      />
      <Button
        label={sending ? chatCopy.sending : chatCopy.send}
        onPress={() => void send()}
        loading={sending}
        disabled={!draft.trim()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: spacing.sm },
  bubble: { borderRadius: 12, padding: spacing.sm, gap: 2, maxWidth: '85%' },
  own: { alignSelf: 'flex-end', backgroundColor: colors.infoSurface },
  theirs: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  meta: { fontSize: 12, color: colors.textMuted },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
});
