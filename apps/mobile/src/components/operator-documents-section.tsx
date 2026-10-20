import {
  formatDateTime,
  operatorTripCopy as copy,
  tripDocumentKindLabels,
} from '@transport/shared';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { operatorTripDocumentUrl, type OperatorTripDocument } from '../lib/trip-api';
import { supabase } from '../lib/supabase';
import { spacing } from '../theme';
import { Cell, ErrorText, Footnote, Group, groupInset, SectionHeader, TextCell } from './ui';

/**
 * Documents the operator reads on the road (D22): the service order and the
 * Carta Porte of the assigned trip, read-only. The coordinator (or the
 * shipper) uploads them; the bucket policy lets the assigned operator open them.
 */
export function OperatorDocumentsSection({
  documents,
}: {
  documents: readonly OperatorTripDocument[] | undefined;
}) {
  const [error, setError] = useState<string | null>(null);

  async function open(document: OperatorTripDocument) {
    setError(null);
    try {
      if (!supabase) throw new Error('offline');
      await Linking.openURL(await operatorTripDocumentUrl(supabase, document.storage_path));
    } catch {
      setError(copy.documentOpenFailed);
    }
  }

  return (
    <View style={styles.section}>
      <SectionHeader title={copy.documents} />
      {!documents || documents.length === 0 ? (
        <Group>
          <TextCell tone="dim">{copy.documentsEmpty}</TextCell>
        </Group>
      ) : (
        <Group inset={groupInset.icon}>
          {documents.map((d) => (
            <Cell
              key={d.id}
              icon="document"
              role="link"
              title={tripDocumentKindLabels[d.kind]}
              subtitle={`${d.file_name} · ${formatDateTime(d.created_at)}`}
              onPress={() => void open(d)}
            />
          ))}
        </Group>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
      <Footnote>{copy.documentsHelp}</Footnote>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm + spacing.xs },
});
