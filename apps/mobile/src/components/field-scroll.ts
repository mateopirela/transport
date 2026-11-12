import { useCallback, useEffect, useRef, useState } from 'react';
import type { HostInstance, ScrollView, TextInput, View } from 'react-native';

import { spacing } from '../theme';

type FieldNode = View | TextInput;

/**
 * The view that holds a ScrollView's content: React Native has
 * `getInnerViewRef` at runtime but leaves it out of its types.
 */
function contentOf(scroll: ScrollView): HostInstance | null {
  return (scroll as unknown as { getInnerViewRef(): HostInstance | null }).getInnerViewRef();
}

/**
 * Scrolls a form to the field with an error (D42: the error shows on the
 * field that failed, and the form goes to it). `scrollRef` goes to the
 * Screen, `register(field)` to the input of a FieldCell (`inputRef`) or to a
 * View around any other control. `scrollTo(field)` waits for the next frame,
 * so a step that has just appeared is laid out before it is measured.
 */
export function useFieldScroll() {
  const scrollRef = useRef<ScrollView>(null);
  const nodes = useRef(new Map<string, FieldNode>());
  const refs = useRef(new Map<string, (node: FieldNode | null) => void>());
  const [target, setTarget] = useState<string | null>(null);

  const register = useCallback((field: string) => {
    let ref = refs.current.get(field);
    if (!ref) {
      ref = (node: FieldNode | null) => {
        if (node) nodes.current.set(field, node);
        else nodes.current.delete(field);
      };
      refs.current.set(field, ref);
    }
    return ref;
  }, []);

  useEffect(() => {
    if (target === null) return undefined;
    const frame = requestAnimationFrame(() => {
      setTarget(null);
      const node = nodes.current.get(target);
      const scroll = scrollRef.current;
      const content = scroll ? contentOf(scroll) : null;
      if (!node || !scroll || !content) return;
      node.measureLayout(
        content,
        (_x, y) => scroll.scrollTo({ y: Math.max(y - spacing.xl, 0), animated: true }),
        () => undefined,
      );
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  const scrollTo = useCallback((field: string | null) => {
    if (field !== null) setTarget(field);
  }, []);

  return { scrollRef, register, scrollTo };
}
