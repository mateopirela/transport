import { Text } from 'react-native';

import { useTheme } from '../theme';
import { ControlCell } from './ui';

/**
 * A label and a value too long for one line (a window of dates, the cargo, the
 * notes) as a row of a group: the label small above, the value in `body`
 * under it. Short values go in ValueRow, side by side. U9 may fold it into
 * the kit.
 */
export function DetailRow({ label, value }: { label: string; value: string }) {
  const { type } = useTheme();
  return (
    <ControlCell label={label}>
      <Text style={type.body}>{value}</Text>
    </ControlCell>
  );
}
