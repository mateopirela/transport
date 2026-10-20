import { mobileCompanyCopy as copy, MX_STATES, type MxState } from '@transport/shared';
import { useRef } from 'react';
import { Text } from 'react-native';

import { useTheme } from '../theme';
import { OptionSheet, type SheetHandle } from './sheet';
import { Cell, ErrorText } from './ui';

const OPTIONS = MX_STATES.map((state) => ({ value: state, label: state }));

/**
 * The fiscal state (one of the 32 federative entities) as a row of a group,
 * like the fields around it: the label small above, the state or a
 * placeholder under it. Tapping it opens the list in a sheet.
 */
export function StatePicker({
  value,
  onChange,
  error,
}: {
  value: MxState | '';
  onChange: (value: MxState) => void;
  error?: string | undefined;
}) {
  const { type, colors } = useTheme();
  const sheet = useRef<SheetHandle>(null);
  return (
    <>
      <Cell
        role="button"
        accessibilityLabel={copy.stateLabel}
        chevron
        onPress={() => sheet.current?.open()}
      >
        <Text style={[type.label, error ? { color: colors.redText } : null]}>
          {copy.stateLabel}
        </Text>
        <Text style={value ? type.body : [type.body, { color: colors.textFaint }]}>
          {value || copy.statePlaceholder}
        </Text>
        {error ? <ErrorText>{error}</ErrorText> : null}
      </Cell>
      <OptionSheet
        ref={sheet}
        title={copy.stateLabel}
        options={OPTIONS}
        value={value || undefined}
        onChange={onChange}
      />
    </>
  );
}
