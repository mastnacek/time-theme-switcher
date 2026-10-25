/**
 * Time-of-day -> theme rotation slice.
 * Maps solar times to PiTUI theme names.
 */

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

/** Pi theme file names per slot (terminals-preview.html palettes). */
export const THEME_NAMES: Record<TimeTheme, string> = {
  dawn: "dawn",        // Gruvbox Material Soft Dark
  day: "day",          // Solarized Light
  dusk: "dusk",        // Catppuccin Macchiato
  night: "osaka-jade", // Osaka Jade
};

/** Theme display names for UI. */
export const THEME_LABELS: Record<TimeTheme, string> = {
  dawn: "Dawn (Gruvbox Material Soft Dark)",
  day: "Day (Solarized Light)",
  dusk: "Dusk (Catppuccin Macchiato)",
  night: "Osaka Jade",
};
