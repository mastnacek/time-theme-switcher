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

/**
 * Recommended slot→theme mapping. These are the palettes shipped with the
 * plugin (themes/*.json, declared under pi.themes in package.json), so a fresh
 * install resolves every slot without the user adding theme files.
 *
 * The `tts-` prefix keeps the packaged copies distinct from same-named themes
 * in ~/.pi/agent/themes/ or .pi/themes/ — those outrank package resources and
 * would otherwise produce a "name collision" diagnostic at startup.
 */
export const DEFAULT_SLOT_THEMES: SlotThemes = {
  dawn: "tts-dawn", // Gruvbox Material Soft Dark
  day: "tts-day", // Solarized Light
  dusk: "tts-dusk", // Catppuccin Macchiato
  night: "tts-osaka-jade", // Osaka Jade
};

/**
 * A temporary manual override of the solar slot (`/tts hold`): the sun
 * cannot tell whether the room lights are on, the operator can.
 */
export interface HoldState {
  slot: keyof SlotThemes;
  /** ISO timestamp; once passed, solar rotation resumes. */
  until: string;
}

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
  /**
   * Synchronize host terminal background color with the active theme background
   * using OSC 11 (\x1b]11;#RRGGBB\x07), and reset with OSC 111 (\x1b]111\x07) on exit/stop.
   */
  syncTerminalBg: boolean;
  /**
   * Synchronize host terminal foreground (font) color with the active theme foreground
   * using OSC 10 (\x1b]10;#RRGGBB\x07), and reset with OSC 110 (\x1b]110\x07) on exit/stop.
   */
  syncTerminalFg: boolean;
  /**
   * Synchronize Herdr multiplexer theme in config.toml
   * (%APPDATA%\herdr\config.toml on Windows, ~/.config/herdr/config.toml on Unix, or HERDR_CONFIG_PATH)
   * and reload via `herdr server reload-config`.
   */
  syncHerdrTheme: boolean;
  /**
   * Manual slot override, shared by every pi session through this config
   * file; null when the sun decides.
   */
  hold: HoldState | null;
}

export const SETTINGS_DEFAULTS: Settings = {
  enabled: true,
  latitude: 50.0755, // Prague
  longitude: 14.4378,
  timezone: "Europe/Prague",
  lang: "en",
  themes: DEFAULT_SLOT_THEMES,
  syncTerminalBg: true,
  syncTerminalFg: true,
  syncHerdrTheme: true,
  hold: null,
};
