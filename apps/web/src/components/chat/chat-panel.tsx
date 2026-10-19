'use client';

import {
  CHAT_ATTACHMENT_TYPES,
  chatAttachmentPath,
  chatCopy,
  chatSenderLabel,
  formatDateTime,
  MAX_MESSAGE_LENGTH,
  type Tables,
} from '@transport/shared';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Notice } from '@/components/auth-forms';
import { Button } from '@/components/ui/button';
import { markConversationRead, sendMessage } from '@/lib/chat/actions';
import {
  attachmentIssue,
  CHAT_PAGE_SIZE,
  isReadByCounterpart,
  MESSAGE_COLUMNS,
  mergeMessages,
  mergeReads,
  toChatMessage,
  type ChatMessage,
  type ChatRead,
} from '@/lib/chat/messages';
import { chatAttachmentHref, type WebArea } from '@/lib/routing';
import { channelTopic, createBrowserSupabase, subscribeAsUser } from '@/lib/supabase/browser';
import { cn } from '@/lib/utils';

const ACCEPT = Object.keys(CHAT_ATTACHMENT_TYPES).join(',');

/** A file chosen for the next message; `path` is set once it is uploaded. */
interface Draft {
  key: string;
  file: File;
  path?: string;
}

/**
 * Real-time chat of a conversation (D01): messages, their anonymization (D18)
 * and read markers arrive by Realtime (RLS applies), files go straight to the private `chat` bucket and
 * send_message checks them. Every time the channel (re)connects, the chat
 * fetches what it may have missed. Without Realtime, the sender still sees
 * their own messages and the page shows the rest on reload.
 */
export function ChatPanel({
  conversationId,
  viewerId,
  ownCompanyUserIds,
  initialMessages,
  initialReads,
  area = 'cliente',
}: {
  conversationId: string;
  viewerId: string;
  ownCompanyUserIds: readonly string[];
  initialMessages: ChatMessage[];
  initialReads: ChatRead[];
  /** Area whose attachment route opens the files (each area guards its own). */
  area?: WebArea;
}) {
  // What arrived after the server render (Realtime, catch-up, own sends);
  // merged with the server data, so a refresh of the page adds to it too.
  const [live, setLive] = useState<ChatMessage[]>([]);
  const [liveReads, setLiveReads] = useState<ChatRead[]>([]);
  const messages = useMemo(() => mergeMessages(initialMessages, live), [initialMessages, live]);
  const reads = useMemo(() => mergeReads(initialReads, liveReads), [initialReads, liveReads]);
  // Newest message shown, so "read" never covers one the viewer has not seen.
  const latestShown = useRef<string | null>(null);
  const [body, setBody] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Same id for every retry of one message, so send_message stores it once;
  // editing the message makes it a new one.
  const clientMessageId = useRef<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const own = useMemo(() => new Set(ownCompanyUserIds), [ownCompanyUserIds]);

  useEffect(() => {
    latestShown.current = messages.at(-1)?.id ?? null;
  }, [messages]);

  useEffect(() => {
    const markShownRead = () => {
      if (latestShown.current && document.visibilityState === 'visible') {
        void markConversationRead(conversationId, latestShown.current);
      }
    };
    markShownRead();
    const supabase = createBrowserSupabase();
    if (!supabase) return;
    const filter = `conversation_id=eq.${conversationId}`;
    // Messages and markers written before the channel joined (or while it
    // was disconnected) never arrive by Realtime: fetch them on each join.
    const catchUp = async () => {
      const [recent, markers] = await Promise.all([
        supabase
          .from('messages')
          .select(MESSAGE_COLUMNS)
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(CHAT_PAGE_SIZE),
        supabase
          .from('message_reads')
          .select('user_id, last_read_at')
          .eq('conversation_id', conversationId),
      ]);
      if (recent.data) setLive((current) => mergeMessages(current, recent.data.map(toChatMessage)));
      if (markers.data) setLiveReads((current) => mergeReads(current, markers.data));
      const newest = recent.data?.[0];
      if (newest && document.visibilityState === 'visible') {
        void markConversationRead(conversationId, newest.id);
      }
    };
    const unsubscribe = subscribeAsUser(supabase, () =>
      supabase
        .channel(channelTopic(`chat:${conversationId}`))
        .on<Tables<'messages'>>(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter },
          ({ new: row }) => {
            const message = toChatMessage(row);
            setLive((current) => mergeMessages(current, [message]));
            if (message.sender_id !== viewerId && document.visibilityState === 'visible') {
              void markConversationRead(conversationId, message.id);
            }
          },
        )
        // A message is only ever updated when its sender's account is deleted
        // (D18): it stays, now as "Cuenta eliminada".
        .on<Tables<'messages'>>(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter },
          ({ new: row }) => setLive((current) => mergeMessages(current, [toChatMessage(row)])),
        )
        .on<Tables<'message_reads'>>(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'message_reads', filter },
          ({ new: row }) => {
            if ('user_id' in row && 'last_read_at' in row) {
              setLiveReads((current) =>
                mergeReads(current, [{ user_id: row.user_id, last_read_at: row.last_read_at }]),
              );
            }
          },
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void catchUp();
        }),
    );
    // Messages that arrived while the tab was hidden are read on return.
    const onVisible = () => markShownRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      unsubscribe();
    };
  }, [conversationId, viewerId]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages.length]);

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = [...drafts, ...Array.from(files, (file) => ({ key: crypto.randomUUID(), file }))];
    const issue = attachmentIssue(next.map((d) => d.file));
    if (issue) return setError(chatCopy.errors[issue]);
    setError(null);
    clientMessageId.current = null;
    setDrafts(next);
  }

  async function send() {
    const supabase = createBrowserSupabase();
    if (!supabase) return setError(chatCopy.errors.send);
    clientMessageId.current ??= crypto.randomUUID();
    // Upload what is not uploaded yet; a retry reuses the files already there.
    const uploaded: Draft[] = [];
    for (const draft of drafts) {
      if (draft.path) {
        uploaded.push(draft);
        continue;
      }
      const path = chatAttachmentPath(
        conversationId,
        crypto.randomUUID(),
        draft.file.type as keyof typeof CHAT_ATTACHMENT_TYPES,
      );
      const result = await supabase.storage
        .from('chat')
        .upload(path, draft.file, { contentType: draft.file.type, upsert: false });
      if (result.error) {
        setDrafts([...uploaded, ...drafts.slice(uploaded.length)]);
        return setError(chatCopy.errors.upload);
      }
      uploaded.push({ ...draft, path });
    }
    setDrafts(uploaded);

    const result = await sendMessage({
      conversationId,
      clientMessageId: clientMessageId.current,
      body,
      attachments: uploaded.map((d) => ({ path: d.path ?? '', name: d.file.name })),
    });
    if (result.error) return setError(result.error);
    const sent = result.message;
    if (sent) setLive((current) => mergeMessages(current, [sent]));
    clientMessageId.current = null;
    setBody('');
    setDrafts([]);
  }

  return (
    <section className="flex flex-col rounded-xl border bg-card">
      <ol
        ref={listRef}
        className="max-h-[28rem] min-h-48 space-y-3 overflow-y-auto p-4"
        aria-live="polite"
      >
        {messages.length === 0 && (
          <li className="text-sm text-muted-foreground">{chatCopy.empty}</li>
        )}
        {messages.map((message) => {
          // A message without a sender (deleted account, D18) is nobody's here.
          const mine =
            message.sender_id !== null &&
            (own.has(message.sender_id) || message.sender_id === viewerId);
          return (
            <li key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] space-y-1 rounded-lg px-3 py-2 text-sm',
                  mine ? 'bg-accent/10' : 'bg-muted',
                )}
              >
                <p className="text-xs text-muted-foreground">
                  {chatSenderLabel(message, viewerId)} · {formatDateTime(message.created_at)}
                </p>
                {message.body && <p className="break-words whitespace-pre-wrap">{message.body}</p>}
                {message.attachments.map((attachment) => (
                  <a
                    key={attachment.path}
                    href={chatAttachmentHref(attachment.path, area)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-accent underline-offset-4 hover:underline"
                  >
                    {chatCopy.attachment}: {attachment.name}
                  </a>
                ))}
                {mine && (
                  <p className="text-right text-xs text-muted-foreground">
                    {isReadByCounterpart(message, reads, own) ? chatCopy.read : chatCopy.sent}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <form
        className="space-y-3 border-t p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (pending || (!body.trim() && drafts.length === 0)) return;
          setError(null);
          setPending(true);
          send()
            .catch(() => setError(chatCopy.errors.send))
            .finally(() => setPending(false));
        }}
      >
        {error && <Notice tone="error">{error}</Notice>}
        <label htmlFor="chat-body" className="sr-only">
          {chatCopy.placeholder}
        </label>
        <textarea
          id="chat-body"
          value={body}
          onChange={(event) => {
            clientMessageId.current = null;
            setBody(event.target.value);
          }}
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={chatCopy.placeholder}
          disabled={pending}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        {drafts.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-xs">
            {drafts.map((draft) => (
              <li
                key={draft.key}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5"
              >
                {draft.file.name}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={chatCopy.removeAttachment(draft.file.name)}
                  disabled={pending}
                  onClick={() => {
                    clientMessageId.current = null;
                    setDrafts(drafts.filter((d) => d.key !== draft.key));
                  }}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="cursor-pointer text-sm text-accent">
            {chatCopy.attach}
            <input
              type="file"
              accept={ACCEPT}
              multiple
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          <Button type="submit" variant="accent" disabled={pending}>
            {pending ? chatCopy.sending : chatCopy.send}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{chatCopy.attachHint}</p>
      </form>
    </section>
  );
}
