import {
  INCIDENT_KINDS,
  incidentFormSchema,
  incidentKindLabels,
  mexicoCityParts,
  operatorTripCopy as copy,
  toOptions,
  unloadEstimateFormSchema,
  unloadEstimateProblem,
  type IncidentFormValues,
  type IncidentKind,
} from '@transport/shared';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { validateForm, type FieldErrors } from '../lib/forms';
import { spacing } from '../theme';
import { ChoiceChips } from './fleet-ui';
import { Button, Field } from './ui';

const DEFAULT_UNLOAD_HOURS = 4;

/**
 * Date and time of the estimated end of unloading (Mexico City). Calls
 * `onSubmit` with the ISO timestamp once it is valid and in range now; the
 * caller checks the range again at the moment it records it.
 */
export function UnloadEstimateForm({
  initial,
  submitLabel,
  busy,
  onSubmit,
}: {
  initial: string | null;
  submitLabel: string;
  busy: boolean;
  onSubmit: (estimatedEndAt: string) => void;
}) {
  const [values, setValues] = useState(() =>
    mexicoCityParts(
      initial ? new Date(initial) : new Date(Date.now() + DEFAULT_UNLOAD_HOURS * 60 * 60 * 1000),
    ),
  );
  const [errors, setErrors] = useState<FieldErrors>({});

  function submit() {
    const parsed = validateForm(unloadEstimateFormSchema, values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return;
    }
    const problem = unloadEstimateProblem(new Date(parsed.data.estimatedEndAt), new Date());
    if (problem) {
      setErrors({
        date: problem === 'beforeNow' ? copy.unloadEstimateBeforeNow : copy.unloadEstimateTooFar,
      });
      return;
    }
    setErrors({});
    onSubmit(parsed.data.estimatedEndAt);
  }

  return (
    <View style={styles.form}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Field
            label={copy.unloadEstimateDate}
            value={values.date}
            onChangeText={(date) => setValues((v) => ({ ...v, date }))}
            error={errors.date}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <View style={styles.flex}>
          <Field
            label={copy.unloadEstimateTime}
            value={values.time}
            onChangeText={(time) => setValues((v) => ({ ...v, time }))}
            error={errors.time}
            keyboardType="numbers-and-punctuation"
          />
        </View>
      </View>
      <Button label={submitLabel} onPress={submit} loading={busy} disabled={busy} />
    </View>
  );
}

const KIND_OPTIONS = toOptions(INCIDENT_KINDS, incidentKindLabels);

/** Kind and description of an incident (report_incident). */
export function IncidentForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (values: IncidentFormValues) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<IncidentKind | undefined>(undefined);
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});

  async function submit() {
    const parsed = validateForm(incidentFormSchema, { kind, description });
    setErrors(parsed.ok ? {} : parsed.errors);
    if (parsed.ok && (await onSubmit(parsed.data))) {
      setKind(undefined);
      setDescription('');
    }
  }

  return (
    <View style={styles.form}>
      <ChoiceChips
        label={copy.incidentKind}
        options={KIND_OPTIONS}
        value={kind}
        onChange={setKind}
        error={errors.kind}
      />
      <Field
        label={copy.incidentDescription}
        value={description}
        onChangeText={setDescription}
        error={errors.description}
        multiline
        maxLength={2000}
      />
      <Button
        label={copy.incidentSubmit}
        onPress={() => void submit()}
        loading={busy}
        disabled={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
});
