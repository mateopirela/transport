import { mobileCompanyCopy as copy, MX_STATES, type MxState } from '@transport/shared';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';
import { Button } from './ui';

/** The fiscal state (one of the 32 federative entities): a field that opens a list. */
export function StatePicker({
  value,
  onChange,
  error,
}: {
  value: MxState | '';
  onChange: (value: MxState) => void;
  error?: string | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{copy.stateLabel}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copy.stateLabel}
        onPress={() => setOpen(true)}
        style={[styles.input, error ? styles.inputError : null]}
      >
        <Text style={value ? styles.value : styles.placeholder}>
          {value || copy.statePlaceholder}
        </Text>
      </Pressable>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={styles.modal}>
          <Text style={styles.modalTitle}>{copy.stateLabel}</Text>
          <FlatList
            data={MX_STATES}
            keyExtractor={(name) => name}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                }}
                style={[styles.option, item === value ? styles.optionSelected : null]}
              >
                <Text style={styles.optionText}>{item}</Text>
              </Pressable>
            )}
          />
          <View style={styles.modalFooter}>
            <Button label={copy.stateClose} variant="secondary" onPress={() => setOpen(false)} />
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  inputError: { borderColor: colors.danger },
  value: { fontSize: 16, color: colors.text },
  placeholder: { fontSize: 16, color: colors.textMuted },
  fieldError: { fontSize: 13, color: colors.danger },
  modal: { flex: 1, backgroundColor: colors.background },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.navy,
    padding: spacing.lg,
  },
  option: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  optionSelected: { backgroundColor: colors.infoSurface },
  optionText: { fontSize: 16, color: colors.text },
  modalFooter: { padding: spacing.lg },
});
