import { describe, expect, expectTypeOf, it } from 'vitest';

import { MAX_MESSAGE_ATTACHMENTS } from './chat';
import { notificationContent } from './copy/notifications';
import { Constants } from './db';
import { CONVERSATION_KINDS, NOTIFICATION_TYPES, PUSH_PLATFORMS } from './enums';
import type { Database, Enums, Tables } from './index';

type Functions = Database['public']['Functions'];

// Guards the generated types (pnpm db:types) against drifting from the chat
// and notifications schema of B07 (supabase/migrations/*_chat_notifications.sql).
describe('generated database types (B07)', () => {
  it('exposes the chat and notification enums', () => {
    expect([...CONVERSATION_KINDS]).toEqual(['negotiation', 'trip', 'trip_internal']);
    expect([...PUSH_PLATFORMS]).toEqual(['ios', 'android']);
    expect(Constants.public.Enums.notification_type).toEqual([...NOTIFICATION_TYPES]);
    for (const type of NOTIFICATION_TYPES) expect(notificationContent(type, {}).title).toBeTruthy();
    expect(MAX_MESSAGE_ATTACHMENTS).toBe(5);
  });

  it('types conversations, messages, reads, tokens and notifications', () => {
    expectTypeOf<Tables<'conversations'>['kind']>().toEqualTypeOf<Enums<'conversation_kind'>>();
    expectTypeOf<Tables<'conversations'>['trip_id']>().toEqualTypeOf<string | null>();
    expectTypeOf<Tables<'messages'>['body']>().toEqualTypeOf<string | null>();
    expectTypeOf<Tables<'message_reads'>['last_read_at']>().toEqualTypeOf<string>();
    expectTypeOf<Tables<'push_tokens'>['platform']>().toEqualTypeOf<Enums<'push_platform'>>();
    expectTypeOf<Tables<'notifications'>['type']>().toEqualTypeOf<Enums<'notification_type'>>();
    expectTypeOf<Tables<'notifications'>['read_at']>().toEqualTypeOf<string | null>();
  });

  it('types the chat and notification RPCs', () => {
    expectTypeOf<Functions['send_message']['Returns']>().toEqualTypeOf<string>();
    expectTypeOf<Functions['mark_notifications_read']['Returns']>().toEqualTypeOf<number>();
    expectTypeOf<Functions['register_push_token']['Args']['p_platform']>().toEqualTypeOf<
      Enums<'push_platform'>
    >();
  });
});
