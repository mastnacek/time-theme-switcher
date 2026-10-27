/**
 * Time-of-day -> theme rotation slice.
 * Maps solar times to PiTUI theme names.
 */

import { DEFAULT_SLOT_THEMES } from "../../shared/settings.ts";
import { solarElevation } from "../../shared/solar.ts";

export type TimeTheme = "dawn" | "day" | "dusk" | "night";

export interface RotationResult {
  theme: TimeTheme;
  elevation: number;
}

/** Look-ahead used to tell a rising sun from a setting one. */
const TREND_STEP_MS = 5 * 60_000;

/**
 * Map solar elevation to a slot. Twilight (from nautical dusk/dawn at -12°
 * to sunrise/sunset at -0.833°) is split by direction, not by depth: a rising
 * sun means dawn, a setting one dusk — so mornings start with dawn and
 * evenings end with dusk, each one continuous twilight span.
 */
export function themeForElevation(elevation: number, rising: boolean): TimeTheme {
  if (elevation > -0.833) return "day";
  if (elevation > -12) return rising ? "dawn" : "dusk";
  return "night";
}

/** Determine current theme from date + location. */
export function getThemeForTime(date: Date, lat: number, lon: number): TimeTheme {
  const elevation = solarElevation(date, lat, lon);
  const later = solarElevation(new Date(date.getTime() + TREND_STEP_MS), lat, lon);
  return themeForElevation(elevation, later > elevation);
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
