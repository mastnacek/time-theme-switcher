/**
 * Settings slice for time-theme-switcher.
 * Reads user location/timezone config from the global config file
 * (§5 SKILL.md: ~/.pi/agent/<plugin>.json), falling back to Prague defaults.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface LocationSettings {
  latitude: number;
  longitude: number;
  timezone: string;
}

const DEFAULTS: LocationSettings = {
  latitude: 50.0755, // Prague
  longitude: 14.4378,
  timezone: "Europe/Prague",
};

/** Global config path per §5 SKILL.md. */
export const CONFIG_PATH = join(homedir(), ".pi", "agent", "time-theme-switcher.json");

function isValid(value: unknown): value is Partial<LocationSettings> {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.latitude === undefined || typeof v.latitude === "number") &&
    (v.longitude === undefined || typeof v.longitude === "number") &&
    (v.timezone === undefined || typeof v.timezone === "string")
  );
}

/**
 * Load location settings. Reads ~/.pi/agent/time-theme-switcher.json if it
 * exists, merging over the Prague defaults; writes the defaults on first run
 * so the user has a file to edit. Any read/parse error falls back to defaults.
 */
export function getLocationSettings(): LocationSettings {
  try {
    if (!existsSync(CONFIG_PATH)) {
      mkdirSync(dirname(CONFIG_PATH), { recursive: true });
      writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + "\n", "utf8");
      return { ...DEFAULTS };
    }
    const parsed: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    if (!isValid(parsed)) return { ...DEFAULTS };
    return { ...DEFAULTS, ...parsed };
  } catch {
    return { ...DEFAULTS };
  }
}
