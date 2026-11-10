import {
  parseSupportSettings,
  supportCopy,
  supportRoleLabel,
  supportWhatsappUrl,
  tripFolio,
  type SupportSettings,
} from '@transport/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import { supabase } from '../lib/supabase';
import { useSession } from '../providers/session';
import { Cell, Group, groupInset } from './ui';

const NONE: SupportSettings = { whatsapp: null, hours: null };

/**
 * The support settings (I2, D41), read on focus so a number the admin just
 * set shows without restarting the app. Without Supabase, a session or on
 * any error there is no number.
 */
export function useSupportSettings(): SupportSettings {
  const { session } = useSession();
  const signedIn = session !== null;
  const [settings, setSettings] = useState<SupportSettings>(NONE);
  useFocusEffect(
    useCallback(() => {
      if (!supabase || !signedIn) return undefined;
      let active = true;
      void supabase
        .from('platform_settings')
        .select('key, value')
        .like('key', 'support.%')
        .then(({ data, error }) => {
          if (active) setSettings(error ? NONE : parseSupportSettings(data));
        });
      return () => {
        active = false;
      };
    }, [signedIn]),
  );
  return settings;
}

/**
 * "Ayuda" (I2, D41): a row that opens WhatsApp with a message that says the
 * role and, inside a trip, its folio. Without a support number, nothing.
 */
export function HelpCell({ tripId }: { tripId?: string | null | undefined }) {
  const { profile } = useSession();
  const { whatsapp, hours } = useSupportSettings();
  const url = supportWhatsappUrl({
    whatsapp,
    roleLabel: supportRoleLabel(profile?.role, profile?.isOwnerOperator === true),
    tripId,
  });
  if (!url) return null;
  const folio = tripFolio(tripId);
  const lines = [folio ? supportCopy.helpWithTrip(folio) : supportCopy.helpSubtitle];
  if (hours) lines.push(supportCopy.hours(hours));
  return (
    <Group inset={groupInset.icon}>
      <Cell
        icon="help"
        role="link"
        title={supportCopy.help}
        subtitle={lines.join('\n')}
        subtitleLines={3}
        onPress={() => void Linking.openURL(url)}
      />
    </Group>
  );
}
