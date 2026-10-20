import { palette } from '@transport/shared';
import { describe, expect, it } from 'vitest';

import { mapColors } from './map-colors';

describe('mapColors', () => {
  it('draws the maps with the light palette', () => {
    expect(mapColors.route).toBe(palette.light.accent);
    expect(mapColors.trail).toBe(palette.light.text);
    expect(mapColors.pin).toBe(palette.light.accent);
    expect(mapColors.pinGlyph).toBe(palette.light.accentInk);
  });
});
