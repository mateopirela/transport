import {
  carrierLoadsCopy,
  chatCopy,
  chatSenderLabel,
  formatDateTime,
  internalChatCopy,
  locationMessage,
  MAX_MESSAGE_LENGTH,
  mergeMessages,
  QUICK_REPORTS,
  type ChatMessage,
} from '@transport/shared';
import { randomUUID } from 'expo-crypto';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import {
  chatAttachmentUrl,
  listMessages,
  markRead,
  sendMessage,
  uploadChatPhoto,
  watchMessages,
  type OutgoingAttachment,
} from '../lib/chat-api';
import { takeChatPhoto } from '../lib/evidence-api';
import { currentPosition } from '../lib/location';
import type { Supabase } from '../lib/supabase';
import { useSession } from '../providers/session';
import { lookOf, shape, spacing, useTheme, type Look } from '../theme';
import { Button, Chip, FieldCell, Footnote, Group, Notice, SectionHeader, TextCell } from './ui';

type Busy = 'text' | 'quick' | 'photo' | 'location' | null;
type ReportKind = Exclude<Busy, 'text' | null>;

/** A report not yet confirmed: retried with the same id and attachment. */
interface PendingReport {
  id: string;
  body: string | null;
  attachments: OutgoingAttachment[];
}

/**
 * Chat of a negotiation or a trip (B07 schema): the latest messages, new ones
 * in real time, and text messages sent with send_message. Opening it, or
 * receiving a message while its screen is in focus, marks the conversation as
 * read (a screen left mounted behind another does not). Attachments open with
 * a short-lived link of the `chat` bucket. The viewer's bubbles on
 * the accent's tint, the others' a step above the cell (§1.7).
 *
 * `internal`: the carrier's internal chat of the trip (H1), where the staff is
 * told apart ("Coordinador", "Gerente"). `reportTools`: the operator's quick
 * reports in chips, "Enviar foto" (camera only) and "Enviar mi ubicación".
 */
export function ChatPanel({
  client,
  conversationId,
  internal = false,
  reportTools = false,
  description = chatCopy.description,
}: {
  client: Supabase;
  conversationId: string;
  internal?: boolean;
  reportTools?: boolean;
  description?: string;
}) {
  const styles = STYLES[useTheme().theme];
  const { session } = useSession();
  const userId = session?.user.id;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const sending = busy === 'text';
  // Kept until the send succeeds, so a retry is idempotent (send_message).
  const pendingId = useRef<string | null>(null);
  // The same for each report tool: the quick report, the photo already
  // uploaded and the location, until send_message confirms them.
  const pendingReports = useRef<Record<ReportKind, PendingReport | null>>({
    quick: null,
    photo: null,
    location: null,
  });
  const focused = useIsFocused();
  const focusedRef = useRef(focused);

  // Back in focus: what arrived meanwhile is read now.
  useEffect(() => {
    focusedRef.current = focused;
    if (focused) void markRead(client, conversationId).catch(() => undefined);
  }, [focused, client, conversationId]);

  const add = useCallback(
    (incoming: ChatMessage[]) => {
      setMessages((current) => mergeMessages(current, incoming));
      if (focusedRef.current) void markRead(client, conversationId).catch(() => undefined);
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

  /** Sends one message; reports `failure` when it does not go. */
  async function deliver(
    kind: Exclude<Busy, null>,
    body: string | null,
    id: string,
    attachments: OutgoingAttachment[] = [],
  ): Promise<boolean> {
    try {
      add([await sendMessage(client, conversationId, body, id, attachments)]);
      return true;
    } catch {
      setProblem(kind === 'photo' ? internalChatCopy.errors.photo : chatCopy.errors.send);
      return false;
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy('text');
    setProblem(null);
    pendingId.current ??= randomUUID();
    if (await deliver('text', body, pendingId.current)) {
      pendingId.current = null;
      setDraft('');
    }
    setBusy(null);
  }

  /** Sends a report and forgets it once confirmed; a failed one waits for its retry. */
  async function deliverReport(kind: ReportKind, report: PendingReport) {
    pendingReports.current[kind] = report;
    if (await deliver(kind, report.body, report.id, report.attachments)) {
      pendingReports.current[kind] = null;
    }
  }

  /** A quick report goes as it reads, with one tap. */
  async function sendQuick(text: string) {
    if (busy) return;
    setBusy('quick');
    setProblem(null);
    const pending = pendingReports.current.quick;
    await deliverReport(
      'quick',
      pending?.body === text ? pending : { id: randomUUID(), body: text, attachments: [] },
    );
    setBusy(null);
  }

  async function sendPhoto() {
    if (busy) return;
    setBusy('photo');
    setProblem(null);
    try {
      // A photo already uploaded whose message did not go: sent again, not retaken.
      const pending = pendingReports.current.photo;
      if (pending) {
        await deliverReport('photo', pending);
        return;
      }
      const photo = await takeChatPhoto();
      if (photo.status === 'cancelled') return;
      if (photo.status !== 'captured') {
        setProblem(
          photo.status === 'denied'
            ? internalChatCopy.errors.cameraDenied
            : internalChatCopy.errors.photo,
        );
        return;
      }
      let attachment: OutgoingAttachment;
      try {
        attachment = await uploadChatPhoto(client, conversationId, photo.uri);
      } catch {
        setProblem(internalChatCopy.errors.photo);
        return;
      }
      await deliverReport('photo', { id: randomUUID(), body: null, attachments: [attachment] });
    } finally {
      setBusy(null);
    }
  }

  async function sendLocation() {
    if (busy) return;
    setBusy('location');
    setProblem(null);
    try {
      const pending = pendingReports.current.location;
      if (pending) {
        await deliverReport('location', pending);
        return;
      }
      const located = await currentPosition();
      if (!located.ok) {
        setProblem(
          located.reason === 'denied'
            ? internalChatCopy.errors.locationDenied
            : internalChatCopy.errors.location,
        );
        return;
      }
      await deliverReport('location', {
        id: randomUUID(),
        body: locationMessage(located.position),
        attachments: [],
      });
    } finally {
      setBusy(null);
    }
  }

  async function openAttachment(path: string) {
    try {
      await Linking.openURL(await chatAttachmentUrl(client, path));
    } catch {
      setProblem(chatCopy.errors.unavailable);
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
                    {`${chatSenderLabel(m, userId, internal)} · ${formatDateTime(m.created_at)}`}
                  </Text>
                  {m.body ? <Text style={styles.body}>{m.body}</Text> : null}
                  {m.attachments.map((attachment) => (
                    <Button
                      key={attachment.path}
                      label={
                        internal && !m.body && m.attachments.length === 1
                          ? internalChatCopy.viewPhoto
                          : `${chatCopy.attachment}: ${attachment.name}`
                      }
                      accessibilityLabel={internalChatCopy.openAttachment(attachment.name)}
                      variant="plain"
                      size="small"
                      icon="image"
                      onPress={() => void openAttachment(attachment.path)}
                    />
                  ))}
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
      <Footnote>{description}</Footnote>
      {problem ? <Notice tone="danger">{problem}</Notice> : null}
      <Button
        label={sending ? chatCopy.sending : chatCopy.send}
        variant="secondary"
        icon="send"
        onPress={() => void send()}
        loading={sending}
        disabled={!draft.trim() || (busy !== null && !sending)}
      />
      {reportTools ? (
        <>
          <SectionHeader title={internalChatCopy.quickReports} />
          <View style={styles.chips}>
            {QUICK_REPORTS.map((text) => (
              <Chip key={text} label={text} onPress={() => void sendQuick(text)} />
            ))}
          </View>
          <View style={styles.tools}>
            <Button
              label={busy === 'photo' ? internalChatCopy.sendingPhoto : internalChatCopy.sendPhoto}
              variant="secondary"
              icon="camera"
              onPress={() => void sendPhoto()}
              loading={busy === 'photo'}
              disabled={busy !== null && busy !== 'photo'}
            />
            <Button
              label={
                busy === 'location'
                  ? internalChatCopy.sendingLocation
                  : internalChatCopy.sendLocation
              }
              variant="secondary"
              icon="locate"
              onPress={() => void sendLocation()}
              loading={busy === 'location'}
              disabled={busy !== null && busy !== 'location'}
            />
          </View>
        </>
      ) : null}
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
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    tools: { gap: spacing.sm },
  });
}

const STYLES = { light: makeStyles(lookOf('light')), dark: makeStyles(lookOf('dark')) };
