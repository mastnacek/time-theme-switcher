/**
 * Shared kernel: plugin settings shape + defaults.
 * Kept in src/shared/ so slices can depend on the type without importing
 * each other (VSA: slices never import slices).
 */

/**
 * Pi theme name per solar slot. Users re-assign these in the settings UI;
 * DEFAULT_SLOT_THEMES is the recommended configuration shown as "Default".
 */
export interface SlotThemes {
  dawn: string;
  day: string;
  dusk: string;
  night: string;
}

/** Recommended slot→theme mapping (terminals-preview palettes). */
export const DEFAULT_SLOT_THEMES: SlotThemes = {
  dawn: "dawn", // Gruvbox Material Soft Dark
  day: "day", // Solarized Light
  dusk: "dusk", // Catppuccin Macchiato
  night: "osaka-jade", // Osaka Jade
};

export interface Settings {
  /** Master switch: when false, the extension never touches the theme. */
  enabled: boolean;
  latitude: number;
  longitude: number;
  timezone: string;
  /** UI language: persisted "lang" config key (see src/shared/i18n.ts). */
  lang: string;
  /** Pi theme assigned to each solar slot. */
  themes: SlotThemes;
}

export const SETTINGS_DEFAULTS: Settings = {
  enabled: true,
  latitude: 50.0755, // Prague
  longitude: 14.4378,
  timezone: "Europe/Prague",
  lang: "en",
  themes: DEFAULT_SLOT_THEMES,
};
