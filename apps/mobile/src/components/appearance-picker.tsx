import { appearanceCopy, THEME_CHOICES } from '@transport/shared';

import { useTheme } from '../theme';
import { ControlCell, Group, Segmented } from './ui';

const OPTIONS = THEME_CHOICES.map((value) => ({ value, label: appearanceCopy[value] }));

/** "Apariencia" (D26): Sistema, Claro or Oscuro, kept on the phone. A group of its own. */
export function AppearancePicker() {
  const { choice, setChoice } = useTheme();
  return (
    <Group>
      <ControlCell label={appearanceCopy.title}>
        <Segmented
          label={appearanceCopy.title}
          value={choice}
          options={OPTIONS}
          onChange={setChoice}
        />
      </ControlCell>
    </Group>
  );
}
