import { expect } from '@playwright/test';

import { confirmationPath, emailCode } from './data';
import { mailpitURL } from './env';

interface MailpitSearch {
  messages?: { ID: string }[];
}

interface MailpitMessage {
  HTML?: string;
  Text?: string;
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(new URL(path, mailpitURL));
  if (!response.ok) throw new Error(`Mailpit ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

/**
 * Waits for the sign-up confirmation email sent to `email` (Mailpit of the
 * local stack) and returns the path of its link, to open on the web under test.
 */
export async function waitForConfirmationPath(email: string): Promise<string> {
  let path: string | null = null;
  await expect
    .poll(
      async () => {
        const search = await getJson<MailpitSearch>(
          `/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
        );
        const id = search.messages?.[0]?.ID;
        if (!id) return null;
        const message = await getJson<MailpitMessage>(`/api/v1/message/${id}`);
        path = confirmationPath(`${message.HTML ?? ''}\n${message.Text ?? ''}`);
        return path;
      },
      { message: `confirmation email to ${email}`, timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .not.toBeNull();
  if (!path) throw new Error(`No confirmation link for ${email}`);
  return path;
}

/**
 * Waits for the latest email sent to `email` whose subject contains
 * `subject` and returns its six-digit code and the path of its link (S1,
 * D15-E3: the confirmation and recovery emails carry both). `after` skips a
 * message already read (its Mailpit id), to wait for a resend.
 */
export async function waitForEmailCode(
  email: string,
  subject: string,
  after?: string,
): Promise<{ id: string; code: string; path: string | null; html: string }> {
  let found: { id: string; code: string; path: string | null; html: string } | null = null;
  await expect
    .poll(
      async () => {
        const search = await getJson<MailpitSearch>(
          `/api/v1/search?query=${encodeURIComponent(`to:"${email}" subject:"${subject}"`)}`,
        );
        const id = search.messages?.[0]?.ID;
        if (!id || id === after) return null;
        const message = await getJson<MailpitMessage>(`/api/v1/message/${id}`);
        const html = message.HTML ?? '';
        const code = emailCode(html);
        if (code) found = { id, code, path: confirmationPath(html), html };
        return code;
      },
      { message: `email "${subject}" to ${email}`, timeout: 30_000, intervals: [500, 1000, 2000] },
    )
    .not.toBeNull();
  if (!found) throw new Error(`No code in the email "${subject}" to ${email}`);
  return found;
}
