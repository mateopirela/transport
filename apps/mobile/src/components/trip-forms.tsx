import {
  DEFAULT_DWELL_MINUTES,
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
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { StyleSheet, View } from 'react-native';

import { validateForm, type FieldErrors } from '../lib/forms';
import { spacing } from '../theme';
import { Button, Chip, ControlCell, FieldCell, Group } from './ui';

/**
 * What a screen holds of a form whose button lives elsewhere (in the bottom
 * bar): `submit` returns the value once it is valid, or null and shows the
 * errors by the fields.
 */
export interface FormHandle<T> {
  submit: () => T | null;
}

/**
 * Date and time of the estimated end of unloading (Mexico City). `submit`
 * returns the ISO timestamp once it is valid and in range now; the caller
 * checks the range again at the moment it records it.
 */
function useUnloadEstimateForm(initial: string | null, defaultMinutes: number) {
  const suggested = (minutes: number) =>
    mexicoCityParts(initial ? new Date(initial) : new Date(Date.now() + minutes * 60 * 1000));
  const [values, setFields] = useState(() => suggested(defaultMinutes));
  const [errors, setErrors] = useState<FieldErrors>({});
  // H5: a suggestion that arrives later (the site's estimate, after a reload)
  // replaces the fields only while the operator has not edited them.
  const [touched, setTouched] = useState(false);
  const [shownMinutes, setShownMinutes] = useState(defaultMinutes);
  if (shownMinutes !== defaultMinutes) {
    setShownMinutes(defaultMinutes);
    if (!touched && !initial) setFields(suggested(defaultMinutes));
  }
  const setValues: typeof setFields = (next) => {
    setTouched(true);
    setFields(next);
  };

  function submit(): string | null {
    const parsed = validateForm(unloadEstimateFormSchema, values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      return null;
    }
    const problem = unloadEstimateProblem(new Date(parsed.data.estimatedEndAt), new Date());
    if (problem) {
      setErrors({
        date: problem === 'beforeNow' ? copy.unloadEstimateBeforeNow : copy.unloadEstimateTooFar,
      });
      return null;
    }
    setErrors({});
    return parsed.data.estimatedEndAt;
  }

  return { values, setValues, errors, submit };
}

/**
 * The date and the time of the estimate, as two rows of a group. The default
 * (in `defaultMinutes`: the typical unloading at the site, H5, or four hours)
 * is taken when the fields appear, and again when a new suggestion arrives
 * before the operator edits them. The screen sends them through `ref`
 * ("Iniciar descarga" in its bottom bar).
 */
export function UnloadEstimateFields({
  ref,
  initial,
  defaultMinutes = DEFAULT_DWELL_MINUTES.delivery,
}: {
  ref?: Ref<FormHandle<string>>;
  initial: string | null;
  defaultMinutes?: number;
}) {
  const { values, setValues, errors, submit } = useUnloadEstimateForm(initial, defaultMinutes);
  useImperativeHandle(ref, () => ({ submit }));
  return (
    <Group>
      <FieldCell
        label={copy.unloadEstimateDate}
        value={values.date}
        onChangeText={(date) => setValues((v) => ({ ...v, date }))}
        error={errors.date}
        keyboardType="numbers-and-punctuation"
      />
      <FieldCell
        label={copy.unloadEstimateTime}
        value={values.time}
        onChangeText={(time) => setValues((v) => ({ ...v, time }))}
        error={errors.time}
        keyboardType="numbers-and-punctuation"
      />
    </Group>
  );
}

/** The estimate's fields and a secondary button that saves it ("Guardar fin estimado"). */
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
  const fields = useRef<FormHandle<string>>(null);
  return (
    <View style={styles.form}>
      <UnloadEstimateFields ref={fields} initial={initial} />
      <Button
        label={submitLabel}
        variant="secondary"
        onPress={() => {
          const at = fields.current?.submit();
          if (at) onSubmit(at);
        }}
        loading={busy}
        disabled={busy}
      />
    </View>
  );
}

const KIND_OPTIONS = toOptions(INCIDENT_KINDS, incidentKindLabels);

/**
 * Kind and description of an incident (report_incident), in one group. Its
 * button is secondary: the screen's one primary is the next trip step.
 */
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
      <Group>
        <ControlCell label={copy.incidentKind} error={errors.kind}>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={copy.incidentKind}
            style={styles.chips}
          >
            {KIND_OPTIONS.map((option) => (
              <Chip
                key={option.value}
                role="radio"
                label={option.label}
                selected={option.value === kind}
                onPress={() => setKind(option.value)}
              />
            ))}
          </View>
        </ControlCell>
        <FieldCell
          label={copy.incidentDescription}
          value={description}
          onChangeText={setDescription}
          error={errors.description}
          multiline
          maxLength={2000}
        />
      </Group>
      <Button
        label={copy.incidentSubmit}
        variant="secondary"
        onPress={() => void submit()}
        loading={busy}
        disabled={busy}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.sm + spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs },
});
