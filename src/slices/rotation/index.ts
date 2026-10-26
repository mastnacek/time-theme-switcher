/**
 * Time-of-day -> theme rotation slice.
 * Maps solar times to PiTUI theme names.
 */

import { DEFAULT_SLOT_THEMES } from "../../shared/settings.ts";
import { computeSolarTimes, solarElevation } from "../../shared/solar.ts";

export type TimeTheme = "dawn" | "day" | "dusk" | "night";

export interface RotationResult {
  theme: TimeTheme;
  elevation: number;
}

/** Map solar elevation to a theme name. */
export function themeForElevation(elevation: number): TimeTheme {
  if (elevation > -0.833) return "day";
  if (elevation > -6) return "dawn";
  if (elevation > -12) return "dusk";
  return "night";
}

/** Determine current theme from date + location. */
export function getThemeForTime(date: Date, lat: number, lon: number): TimeTheme {
  const solar = computeSolarTimes(date, lat, lon);
  const elevation = solarElevation(date, lat, lon);
  return themeForElevation(elevation);
}

/**
 * Default Pi theme file name per slot — the recommended mapping, labeled
 * "Default" in the settings UI. Users can assign any registered theme per
 * slot (Settings.themes); this is only the fallback.
 */
export const THEME_NAMES: Record<TimeTheme, string> = DEFAULT_SLOT_THEMES;

/** Theme display names for UI. */
export const THEME_LABELS: Record<TimeTheme, string> = {
  dawn: "Dawn (Gruvbox Material Soft Dark)",
  day: "Day (Solarized Light)",
  dusk: "Dusk (Catppuccin Macchiato)",
  night: "Night (Osaka Jade)",
};
