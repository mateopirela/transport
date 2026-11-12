import { needsUpload, onboardingStepsCopy as copy } from '@transport/shared';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { operatorOnboarding } from '../lib/onboarding';
import { loadOperatorDocuments } from '../lib/operator-documents-api';
import { supabase } from '../lib/supabase';
import { useLoader } from '../lib/use-loader';
import { useSession } from '../providers/session';
import { spacing, useTheme } from '../theme';
import { Button, Notice } from './ui';

/**
 * On the operator's trip screen while a required document of theirs needs an
 * upload (R3): the trip gate (D45) keeps them off trips until it is approved,
 * so it says so and opens "Mis documentos". Nothing while it loads or fails.
 */
export function OperatorDocumentsNotice() {
  const router = useRouter();
  const { type } = useTheme();
  const { session, profile } = useSession();
  const userId = session?.user.id ?? null;
  const companyId = profile?.companyId ?? null;
  const load = useCallback(
    () =>
      supabase && userId && companyId
        ? loadOperatorDocuments(supabase, companyId, userId)
        : new Promise<never>(() => undefined),
    [userId, companyId],
  );
  const { state } = useLoader(load);
  if (state.status !== 'ready' || !state.data.operatorId) return null;
  const { work } = operatorOnboarding(state.data.context, state.data.operatorId);
  if (!work.profile.some(needsUpload)) return null;
  return (
    <Notice tone="warning">
      <Text style={type.subhead}>{copy.operator.pending}</Text>
      <View style={styles.action}>
        <Button
          label={copy.operator.open}
          variant="secondary"
          size="small"
          onPress={() => router.push('/documents')}
        />
      </View>
    </Notice>
  );
}

const styles = StyleSheet.create({ action: { marginTop: spacing.xs, alignItems: 'flex-start' } });
