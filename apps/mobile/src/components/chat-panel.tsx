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
import { lookOf, shape, spacing, useTheme, type Look } from '../theme';
import { Button, FieldCell, Footnote, Group, Notice, TextCell } from './ui';

/**
 * Chat of a negotiation or a trip (B07 schema): the latest messages, new ones
 * in real time, and text messages sent with send_message. Opening it or
 * receiving a message marks the conversation as read. The viewer's bubbles on
 * the accent's tint, the others' a step above the cell (§1.7).
 */
export function ChatPanel({
  client,
  conversationId,
}: {
  client: Supabase;
  conversationId: string;
}) {
  const styles = STYLES[useTheme().theme];
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
      // Same message, now without sender: nothing new to mark read.
      (m) => setMessages((current) => mergeMessages(current, [m])),
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
    <>
      {loadFailed ? <Notice tone="danger">{carrierLoadsCopy.errors.generic}</Notice> : null}
      <Group>
        {messages.length === 0 && !loadFailed ? (
          <TextCell tone="dim">{chatCopy.empty}</TextCell>
        ) : (
          <View style={styles.thread}>
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
          </View>
        )}
        <FieldCell
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
      </Group>
      <Footnote>{chatCopy.description}</Footnote>
      {sendFailed ? <Notice tone="danger">{chatCopy.errors.send}</Notice> : null}
      <Button
        label={sending ? chatCopy.sending : chatCopy.send}
        variant="secondary"
        icon="send"
        onPress={() => void send()}
        loading={sending}
        disabled={!draft.trim()}
      />
    </>
  );
}

function makeStyles({ colors, type }: Look) {
  return StyleSheet.create({
    thread: { padding: spacing.sm + spacing.xs, gap: spacing.sm },
    bubble: {
      borderRadius: shape.card,
      paddingHorizontal: spacing.sm + spacing.xs,
      paddingVertical: spacing.sm,
      gap: 2,
      maxWidth: '85%',
    },
    own: { alignSelf: 'flex-end', backgroundColor: colors.accentSoft },
    theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceHigh },
    meta: type.caption,
    body: type.body,
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
