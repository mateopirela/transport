import { expect } from '@playwright/test';

import { confirmationPath } from './data';
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
