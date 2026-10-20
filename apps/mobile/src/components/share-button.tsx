import { shareLinksCopy } from '@transport/shared';
import { useState } from 'react';
import { Share, View } from 'react-native';

import { createTeamShareLink, shareSheetMessage } from '../lib/share-api';
import type { Supabase } from '../lib/supabase';
import { Button, Notice } from './ui';

const copy = shareLinksCopy.app;

/**
 * "Compartir con mi equipo" (G7, D23): creates an internal link to the load
 * and opens the system share sheet with it. The link needs a session of the
 * same company to open (open_internal_share), so it can go through any
 * messenger; it lasts 72 hours.
 */
export function ShareWithTeamButton({
  client,
  loadId,
  route,
}: {
  client: Supabase;
  loadId: string;
  route: string;
}) {
  const [sharing, setSharing] = useState(false);
  const [failed, setFailed] = useState(false);

  async function share() {
    if (sharing) return;
    setSharing(true);
    setFailed(false);
    try {
      const { url } = await createTeamShareLink(client, loadId);
      await Share.share({ message: shareSheetMessage(route, url), url });
    } catch {
      setFailed(true);
    } finally {
      setSharing(false);
    }
  }

  return (
    <View>
      {failed ? <Notice tone="danger">{copy.failed}</Notice> : null}
      <Button
        label={sharing ? copy.preparing : copy.shareWithTeam}
        variant="secondary"
        icon="share"
        onPress={() => void share()}
        loading={sharing}
      />
    </View>
  );
}
