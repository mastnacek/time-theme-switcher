/**
 * Settings slice for time-theme-switcher.
 * Reads/writes the user config in the global config file
 * (§5 SKILL.md: ~/.pi/agent/<plugin>.json), falling back to Prague defaults.
 * The Settings shape itself lives in src/shared/settings.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { SETTINGS_DEFAULTS, type Settings } from "../../shared/settings.ts";

/** Global config path per §5 SKILL.md. */
export const CONFIG_PATH = join(homedir(), ".pi", "agent", "time-theme-switcher.json");

function isValid(value: unknown): value is Partial<Settings> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.enabled === undefined || typeof v.enabled === "boolean") &&
    (v.latitude === undefined || typeof v.latitude === "number") &&
    (v.longitude === undefined || typeof v.longitude === "number") &&
    (v.timezone === undefined || typeof v.timezone === "string") &&
    (v.lang === undefined || typeof v.lang === "string")
  );
}

/**
 * Load settings. Reads ~/.pi/agent/time-theme-switcher.json if it exists,
 * merging over the defaults; writes the defaults on first run so the user has
 * a file to edit. Any read/parse error falls back to defaults. Older config
 * files without `enabled`/`lang` default to true/"en" (previous behaviour).
 */
export function getSettings(): Settings {
  try {
    if (!existsSync(CONFIG_PATH)) {
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(SETTINGS_DEFAULTS, null, 2) + "\n", "utf8");
      return { ...SETTINGS_DEFAULTS };
    }
    const parsed: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (!isValid(parsed)) return { ...SETTINGS_DEFAULTS };
    return { ...SETTINGS_DEFAULTS, ...parsed };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

/**
 * Merge a partial update into the current settings and persist them.
 * Returns the resulting settings; on write error returns the merged settings
 * anyway so the session keeps working with the new values.
 */
export function saveSettings(update: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...update };
  try {
    mkdirSync(dirname(CONFIG_PATH), { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", "utf8");
  } catch {
    // Read-only config dir — keep runtime state, just don't persist
  }
  return next;
}
