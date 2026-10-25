/**
 * Shared kernel: plugin settings shape + defaults.
 * Kept in src/shared/ so slices can depend on the type without importing
 * each other (VSA: slices never import slices).
 */

export interface Settings {
  /** Master switch: when false, the extension never touches the theme. */
  enabled: boolean;
  latitude: number;
  longitude: number;
  timezone: string;
  /** UI language: persisted "lang" config key (see src/shared/i18n.ts). */
  lang: string;
}

export const SETTINGS_DEFAULTS: Settings = {
  enabled: true,
  latitude: 50.0755, // Prague
  longitude: 14.4378,
  timezone: "Europe/Prague",
  lang: "en",
};
