/**
 * Settings slice for time-theme-switcher — global config per SKILL.md §5
 * (~/.pi/agent/<plugin>.json).
 *
 * Configuration-management pattern:
 * - SCHEMA below is the single source of truth for keys, types and defaults.
 * - Sanitization is PER FIELD: a corrupt value falls back to its own default
 *   while valid siblings survive (never an all-or-nothing reset).
 * - All disk I/O goes through a SettingsStore (repository pattern) built by
 *   createSettingsStore(); the path is injectable so tests never touch the
 *   real home directory.
 * - Saves are atomic (tmp file + rename) — a crash mid-write cannot leave a
 *   truncated config behind.
 * - Loads self-heal: when the sanitized settings differ from the file on
 *   disk (e.g. keys added by a plugin upgrade), the upgraded file is
 *   persisted. A syntactically corrupt file is never overwritten — the
 *   user's data stays on disk for manual repair.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFAULT_SLOT_THEMES,
  SETTINGS_DEFAULTS,
  type Settings,
  type SlotThemes,
} from "../../shared/settings.ts";

/** Global config path per §5 SKILL.md. */
export const CONFIG_PATH = join(homedir(), ".pi", "agent", "time-theme-switcher.json");

/** One config field: validator + default + optional nested-object merge. */
interface FieldSpec<T> {
  readonly isValid: (value: unknown) => value is T;
  readonly defaultValue: T;
  /** Merge a possibly partial raw value over the base (nested objects). */
  readonly merge?: (base: T, raw: unknown) => T;
}

const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === "string";

const SLOT_KEYS = ["dawn", "day", "dusk", "night"] as const;

/** Per-slot merge: each valid string assignment wins, the rest keep base. */
function mergeThemes(base: SlotThemes, raw: unknown): SlotThemes {
  const out = { ...base };
  if (typeof raw !== "object" || raw === null) return out;
  const source = raw as Record<string, unknown>;
  for (const key of SLOT_KEYS) {
    const value = source[key];
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

/** Single source of truth: every Settings key with validator + default. */
const SCHEMA: { [K in keyof Settings]: FieldSpec<Settings[K]> } = {
  enabled: { isValid: isBoolean, defaultValue: SETTINGS_DEFAULTS.enabled },
  latitude: { isValid: isFiniteNumber, defaultValue: SETTINGS_DEFAULTS.latitude },
  longitude: { isValid: isFiniteNumber, defaultValue: SETTINGS_DEFAULTS.longitude },
  timezone: { isValid: isString, defaultValue: SETTINGS_DEFAULTS.timezone },
  lang: { isValid: isString, defaultValue: SETTINGS_DEFAULTS.lang },
  themes: {
    isValid: (v): v is SlotThemes => typeof v === "object" && v !== null,
    defaultValue: SETTINGS_DEFAULTS.themes,
    merge: mergeThemes,
  },
  syncTerminalBg: { isValid: isBoolean, defaultValue: SETTINGS_DEFAULTS.syncTerminalBg },
};

/** Fresh defaults copy (nested `themes` must not be a shared reference). */
function freshDefaults(): Settings {
  return { ...SETTINGS_DEFAULTS, themes: { ...DEFAULT_SLOT_THEMES } };
}

/** Validate one field against its spec (generic, so SCHEMA stays typed). */
function applySpec<T>(spec: FieldSpec<T>, value: unknown): T {
  if (spec.merge) return spec.merge(spec.defaultValue, value);
  return spec.isValid(value) ? value : spec.defaultValue;
}

/**
 * Per-field sanitization: each key is validated on its own; invalid or
 * missing values fall back to that field's default. Unknown keys are dropped.
 */
function sanitize(raw: unknown): Settings {
  const source =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    enabled: applySpec(SCHEMA.enabled, source.enabled),
    latitude: applySpec(SCHEMA.latitude, source.latitude),
    longitude: applySpec(SCHEMA.longitude, source.longitude),
    timezone: applySpec(SCHEMA.timezone, source.timezone),
    lang: applySpec(SCHEMA.lang, source.lang),
    themes: applySpec(SCHEMA.themes, source.themes),
    syncTerminalBg: applySpec(SCHEMA.syncTerminalBg, source.syncTerminalBg),
  };
}

export interface SettingsStore {
  readonly path: string;
  /**
   * Load and sanitize. Persists defaults on first run and upgrades the file
   * when the sanitized result differs from what is on disk; a corrupt file
   * is left untouched and reported to stderr.
   */
  get(): Settings;
  /** Merge a partial update over the current settings, persist atomically. */
  save(update: Partial<Settings>): Settings;
}

export function createSettingsStore(path: string = CONFIG_PATH): SettingsStore {
  /** Atomic save: write a sibling tmp file, then rename over the target. */
  function persist(settings: Settings): void {
    mkdirSync(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    writeFileSync(tmp, JSON.stringify(settings, null, 2) + "\n", "utf8");
    renameSync(tmp, path);
  }

  function get(): Settings {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      const settings = freshDefaults();
      if (!existsSync(path)) {
        // First run: give the user a file to edit.
        try {
          persist(settings);
        } catch {
          // Read-only config dir — run on in-memory defaults
        }
      } else {
        // Corrupt file: keep the user's data on disk, run on defaults.
        console.error(`time-theme-switcher: ignoring unreadable config at ${path}`);
      }
      return settings;
    }
    const settings = sanitize(raw);
    // Self-heal: persist when the schema moved on (added/renamed keys) or
    // invalid values were replaced by defaults.
    if (JSON.stringify(raw) !== JSON.stringify(settings)) {
      try {
        persist(settings);
      } catch {
        // Read-only config dir — run on in-memory settings
      }
    }
    return settings;
  }

  function save(update: Partial<Settings>): Settings {
    const next = sanitize({ ...get(), ...update });
    try {
      persist(next);
    } catch {
      // Read-only config dir — keep runtime state, just don't persist
    }
    return next;
  }

  return { path, get, save };
}

// ---------------------------------------------------------------------------
// Default singleton over the global config path (lazy: importing this module
// performs no file-system work).
// ---------------------------------------------------------------------------

let defaultStore: SettingsStore | undefined;

function store(): SettingsStore {
  return (defaultStore ??= createSettingsStore());
}

/** Load the global settings (see SettingsStore.get). */
export function getSettings(): Settings {
  return store().get();
}

/** Merge a partial update into the global settings (see SettingsStore.save). */
export function saveSettings(update: Partial<Settings>): Settings {
  return store().save(update);
}
