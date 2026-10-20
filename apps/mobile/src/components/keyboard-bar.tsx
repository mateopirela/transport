import { useEffect, useState, type ComponentProps } from 'react';
import { Keyboard, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomBar } from './ui';

/**
 * How far the keyboard covers the bottom of the screen on iOS, past the
 * phone's own bottom inset (0 while it is hidden). Android resizes the window
 * for the keyboard by itself, so there it is always 0.
 */
export function useKeyboardOverlap(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const show = Keyboard.addListener('keyboardWillShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardWillHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return Math.max(height - insets.bottom, 0);
}

/**
 * The kit's BottomBar, lifted above the keyboard while it is open, so a form
 * whose field has the focus (a decimal pad has no return key) can still be
 * sent. U9 may fold it into BottomBar.
 */
export function KeyboardBottomBar(props: ComponentProps<typeof BottomBar>) {
  const overlap = useKeyboardOverlap();
  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom: overlap }]}>
      <BottomBar {...props} />
    </View>
  );
}

// No height of its own: the bar inside it hangs from its bottom edge.
const styles = StyleSheet.create({ anchor: { position: 'absolute', left: 0, right: 0 } });
