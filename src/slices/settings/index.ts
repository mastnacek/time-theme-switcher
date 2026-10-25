/**
 * Settings slice for time-theme-switcher.
 * Reads/writes the user config in the global config file
 * (§5 SKILL.md: ~/.pi/agent/<plugin>.json), falling back to Prague defaults.
 * The Settings shape itself lives in src/shared/settings.ts.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { DEFAULT_SLOT_THEMES, SETTINGS_DEFAULTS, type Settings } from "../../shared/settings.ts";

/** Global config path per §5 SKILL.md. */
export const CONFIG_PATH = join(homedir(), ".pi", "agent", "time-theme-switcher.json");

const SLOT_KEYS = ["dawn", "day", "dusk", "night"] as const;

/** `themes` may be a partial per-slot object in hand-edited configs. */
function isValidThemes(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return SLOT_KEYS.every((key) => v[key] === undefined || typeof v[key] === "string");
}

function isValid(value: unknown): value is Partial<Settings> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.enabled === undefined || typeof v.enabled === "boolean") &&
    (v.latitude === undefined || typeof v.latitude === "number") &&
    (v.longitude === undefined || typeof v.longitude === "number") &&
    (v.timezone === undefined || typeof v.timezone === "string") &&
    (v.lang === undefined || typeof v.lang === "string") &&
    (v.themes === undefined || isValidThemes(v.themes))
  );
}

/** Fresh defaults copy (nested `themes` must not be a shared reference). */
function defaults(): Settings {
  return { ...SETTINGS_DEFAULTS, themes: { ...DEFAULT_SLOT_THEMES } };
}

/**
 * Load settings. Reads ~/.pi/agent/time-theme-switcher.json if it exists,
 * merging over the defaults; writes the defaults on first run so the user has
 * a file to edit. Any read/parse error falls back to defaults. Older config
 * files without `enabled`/`lang`/`themes` pick up the defaults (previous
 * behaviour); a partial `themes` object merges per slot.
 */
export function getSettings(): Settings {
  try {
    if (!existsSync(CONFIG_PATH)) {
      const fresh = defaults();
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(fresh, null, 2) + "\n", "utf8");
      return fresh;
    }
    const parsed: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (!isValid(parsed)) return defaults();
    return {
      ...defaults(),
      ...parsed,
      themes: { ...DEFAULT_SLOT_THEMES, ...(parsed.themes ?? {}) },
    };
  } catch {
    return defaults();
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
