import { redirect } from 'next/navigation';

import { homeFor, paths } from '@/lib/routing';
import { getViewer } from '@/lib/session';

/** Sends each user to their home (the proxy usually does it first). */
export default async function RootPage() {
  const viewer = await getViewer();
  redirect(viewer ? homeFor(viewer) : paths.signIn);
}
