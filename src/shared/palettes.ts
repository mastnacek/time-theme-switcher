/**
 * Bundled palettes — private theme assets shipped with the plugin.
 *
 * They are deliberately NOT declared under `pi.themes` in package.json, so Pi
 * never registers them: they never appear in /settings pickers, Pi's theme
 * list or the user's settings, and name collisions with themes in
 * ~/.pi/agent/themes/ are impossible. The switcher controller builds them as
 * in-memory Theme instances and applies them via `ui.setTheme(instance)`,
 * which bypasses the name registry entirely (engine's setThemeInstance path).
 *
 * The `tts-` prefix is still meaningful: the assignment UI lists these names
 * next to registered themes, so a distinct namespace avoids confusing
 * duplicates if a user happens to have same-named files of their own.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Theme, type ThemeColor, type ThemeBg } from "@earendil-works/pi-coding-agent";
import { getTerminalColorMode } from "@earendil-works/pi-tui";

/** Palette files shipped with the package (names must match the `name` field). */
export const BUNDLED_PALETTE_FILES = [
  "tts-dawn.json",
  "tts-day.json",
  "tts-dusk.json",
  "tts-night.json",
  "tts-osaka-jade.json",
] as const;

interface PaletteJson {
  name: string;
  appearance?: "dark" | "light";
  vars?: Record<string, string | number>;
  colors: Record<string, string | number>;
}

/** themes/ lives at the package root, two levels above this module. */
const THEMES_DIR_URL = new URL("../../themes/", import.meta.url);

/** Color literal forms the engine treats as final values (theme.js resolveVarRefs). */
function isLiteral(value: string | number): boolean {
  return typeof value === "number" || isColorLiteral(value);
}

function isColorLiteral(value: string): boolean {
  return (
    value === "" ||
    value.startsWith("#") ||
    /^ok(lch|hsl)\(/i.test(value)
  );
}

/** Resolve chained `vars` references the same way the engine does. */
function resolveVarRefs(
  value: string | number,
  vars: Record<string, string | number>,
  visited: Set<string> = new Set(),
): string | number {
  if (isLiteral(value)) return value;
  const key = value as string;
  if (visited.has(key)) {
    throw new Error(`Circular variable reference: ${key}`);
  }
  if (!(key in vars)) {
    throw new Error(`Variable reference not found: ${key}`);
  }
  visited.add(key);
  return resolveVarRefs(vars[key], vars, visited);
}

let cache: Map<string, Theme> | undefined;
let bgCache: Map<string, string> | undefined;

/**
 * Build every bundled palette as an in-memory Theme instance (once per
 * process). Broken files are skipped with a stderr note — rotation then falls
 * back to registered themes or fails with the usual "could not apply" notice.
 */
export function bundledThemes(): Map<string, Theme> {
  if (cache) return cache;
  const map = new Map<string, Theme>();
  for (const file of BUNDLED_PALETTE_FILES) {
    try {
      const json = JSON.parse(
        readFileSync(fileURLToPath(new URL(file, THEMES_DIR_URL)), "utf8"),
      ) as PaletteJson;
      const vars = json.vars ?? {};
      const colors = Object.fromEntries(
        Object.entries(json.colors).map(([key, value]) => [
          key,
          resolveVarRefs(value, vars),
        ]),
      ) as Record<string, string>;
      // SAFETY: theme JSONs carry all ThemeColor tokens plus `vars`; the
      // engine's own loader feeds the whole palette as fgColors and lets
      // withThemeTokenFallbacks fill anything missing — same here. The
      // double cast only widens Record<string,string> to the token map;
      // values are never reinterpreted.
      const fg = colors as unknown as Pick<
        Record<ThemeColor, string | number>,
        ThemeColor
      >;
      const bg = {} as Pick<Record<ThemeBg, string | number>, ThemeBg>;
      const theme = new Theme(fg, bg, getTerminalColorMode(), {
        name: json.name,
        appearance: json.appearance,
      });
      map.set(json.name, theme);
    } catch (error) {
      console.error(
        `time-theme-switcher: skipping bundled palette ${file}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  cache = map;
  return map;
}

/** The bundled Theme with this name, or undefined (name is then a Pi theme). */
export function resolveBundledTheme(name: string): Theme | undefined {
  return bundledThemes().get(name);
}

/** Sorted names of the bundled palettes (for the assignment picker). */
export function bundledThemeNames(): string[] {
  return [...bundledThemes().keys()].sort((a, b) => a.localeCompare(b));
}

/**
 * Background color strings declared by bundled palettes (vars.bg or colors.bg).
 * Returns raw color strings (hex or okhsl/oklch) resolved through vars.
 */
export function bundledThemeBackgrounds(): Map<string, string> {
  if (bgCache) return bgCache;
  const map = new Map<string, string>();
  for (const file of BUNDLED_PALETTE_FILES) {
    try {
      const json = JSON.parse(
        readFileSync(fileURLToPath(new URL(file, THEMES_DIR_URL)), "utf8"),
      ) as PaletteJson;
      const vars = json.vars ?? {};
      const rawBg = vars.bg ?? json.colors.bg ?? json.colors.background;
      if (rawBg !== undefined && rawBg !== "") {
        const resolved = String(resolveVarRefs(rawBg, vars));
        map.set(json.name, resolved);
      }
    } catch {
      // Skip broken files — handled by bundledThemes
    }
  }
  bgCache = map;
  return map;
}

/** Resolved background color string for a bundled palette name, or undefined. */
export function getBundledThemeBg(name: string): string | undefined {
  const bgs = bundledThemeBackgrounds();
  return bgs.get(name) ?? bgs.get(`tts-${name}`);
}
