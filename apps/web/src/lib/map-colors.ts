import { palette } from '@transport/shared';

/**
 * The colours drawn on a Google map (lines and pins), which only take
 * literal colours. The map tiles stay light, so they come from the light
 * palette: the route in the accent, the unit's trail in the text colour.
 */
export const mapColors = Object.freeze({
  route: palette.light.accent,
  trail: palette.light.text,
  pin: palette.light.accent,
  pinBorder: palette.light.accentText,
  pinGlyph: palette.light.accentInk,
});
