/**
 * Switcher slice — Herdr multiplexer theme synchronization.
 * Updates theme name in the platform Herdr config.toml (%APPDATA%\herdr\config.toml
 * on Windows, ~/.config/herdr/config.toml on Unix and macOS, or HERDR_CONFIG_PATH)
 * and triggers `herdr server reload-config` to apply changes live.
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  updateTomlTheme,
  updateTomlThemeDetails,
  type UpdateTomlThemeResult,
} from "./herdr-toml.ts";

export { updateTomlTheme, updateTomlThemeDetails, type UpdateTomlThemeResult };

export const DEFAULT_HERDR_THEMES: Record<string, string> = {
  dawn: "gruvbox",
  day: "solarized-light",
  dusk: "catppuccin",
  night: "rose-pine",
};

/**
 * Default config path for Herdr multiplexer:
 * 1. HERDR_CONFIG_PATH env var if set.
 * 2. %APPDATA%\herdr\config.toml on Windows (win32).
 * 3. $XDG_CONFIG_HOME/herdr/config.toml or ~/.config/herdr/config.toml on Linux, macOS, and other Unix.
 */
export function defaultHerdrConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.HERDR_CONFIG_PATH) return env.HERDR_CONFIG_PATH;
  if (platform === "win32") {
    const appData = env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "herdr", "config.toml");
  }
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "herdr", "config.toml");
  return join(homedir(), ".config", "herdr", "config.toml");
}

/**
 * Detects whether Pi is running under the Herdr terminal multiplexer.
 * Herdr sets HERDR_ENV=1 or TERM_PROGRAM=herdr in the environment.
 */
export function isHerdr(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.HERDR_ENV === "1" ||
    (typeof env.TERM_PROGRAM === "string" &&
      env.TERM_PROGRAM.toLowerCase() === "herdr")
  );
}

/**
 * Resolves the Herdr CLI binary to execute for server reload.
 * Prioritizes HERDR_BIN_PATH, falling back to "herdr" on PATH.
 */
export function resolveHerdrBin(env: NodeJS.ProcessEnv = process.env): string {
  const bin = env.HERDR_BIN_PATH?.trim();
  return bin || "herdr";
}

/**
 * Maps a solar slot or Pi theme name to an appropriate Herdr built-in theme.
 * Supports light counterparts when appearance === "light" or the theme name indicates light mode.
 */
export function resolveHerdrTheme(
  slot: string,
  themeName: string,
  appearance?: "dark" | "light",
): string {
  const lower = themeName.toLowerCase();
  const hasExplicitDark = lower.includes("dark");
  const isLight =
    appearance === "light" ||
    (appearance !== "dark" &&
      !hasExplicitDark &&
      (lower.includes("light") ||
        lower.includes("latte") ||
        lower.includes("lotus") ||
        /(^|[-_ ])(dawn|day)([-_ ]|$)/.test(lower)));

  // Specific bundled theme instances
  if (lower === "tts-day") return "solarized-light";
  if (lower === "tts-dawn") return "gruvbox";
  if (lower === "tts-dusk") return "catppuccin";
  if (lower === "tts-night" || lower === "tts-osaka-jade") return "rose-pine";

  // Family checks with light/dark counterparts
  if (lower.includes("solarized")) return isLight ? "solarized-light" : "solarized";
  if (lower.includes("gruvbox")) return isLight ? "gruvbox-light" : "gruvbox";
  if (lower.includes("catppuccin")) return isLight ? "catppuccin-latte" : "catppuccin";
  if (lower.includes("rose-pine")) return isLight ? "rose-pine-dawn" : "rose-pine";
  if (lower.includes("tokyo")) return isLight ? "tokyo-night-day" : "tokyo-night";
  if (lower.includes("kanagawa")) return isLight ? "kanagawa-lotus" : "kanagawa";
  const isOneTheme =
    /(^|[-_ ])one([-_ ]|$)/.test(lower) ||
    lower.startsWith("one-") ||
    lower.includes("onedark") ||
    lower.includes("onelight");
  if (isOneTheme) return isLight ? "one-light" : "one-dark";

  // Dark-only built-in themes
  if (lower.includes("nord")) return "nord";
  if (lower.includes("dracula")) return "dracula";
  if (lower.includes("vesper")) return "vesper";
  if (lower.includes("terminal")) return "terminal";

  if (slot in DEFAULT_HERDR_THEMES) {
    return DEFAULT_HERDR_THEMES[slot];
  }

  return appearance === "light" ? "solarized-light" : "catppuccin";
}

export interface SyncHerdrOptions {
  configPath?: string;
  reloadServer?: boolean;
  sidebarBg?: string;
  env?: NodeJS.ProcessEnv;
  execFileFn?: typeof execFile;
}

export interface SyncHerdrResult {
  updated: boolean;
  herdrTheme: string;
  sidebarBg?: string;
  autoSwitchDisabled?: boolean;
  error?: string;
}

/**
 * Synchronizes the circadian theme with Herdr multiplexer configuration.
 * Modifies the [theme] and optional [theme.custom] sections and reloads the Herdr server.
 */
export function syncHerdrTheme(
  herdrThemeName: string,
  options: SyncHerdrOptions = {},
): SyncHerdrResult {
  const env = options.env ?? process.env;
  const configPath = options.configPath ?? defaultHerdrConfigPath(env);
  const shouldReload = options.reloadServer ?? isHerdr(env);

  try {
    let original = "";
    if (existsSync(configPath)) {
      original = readFileSync(configPath, "utf8");
    }

    const { content: updatedToml, autoSwitchDisabled } = updateTomlThemeDetails(
      original,
      herdrThemeName,
      options.sidebarBg,
    );
    if (updatedToml !== original) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, updatedToml, "utf8");
    }

    if (shouldReload) {
      try {
        const herdrBin = resolveHerdrBin(env);
        const pathSeparator = process.platform === "win32" ? ";" : ":";
        const extraPaths =
          process.platform === "win32"
            ? [join(homedir(), ".herdr", "bin"), join(homedir(), ".cargo", "bin")]
            : [join(homedir(), ".local", "bin"), join(homedir(), ".cargo", "bin"), "/usr/local/bin"];
        const currentPath = env.PATH ?? "";
        const envPath = `${currentPath}${pathSeparator}${extraPaths.join(pathSeparator)}`;

        const runner = options.execFileFn ?? execFile;
        const child = runner(
          herdrBin,
          ["server", "reload-config"],
          {
            windowsHide: true,
            env: { ...env, PATH: envPath },
          },
          () => {
            // Non-blocking: ignore error when Herdr server is not running or CLI is absent
          },
        );
        child?.unref?.();
      } catch {
        // Safe: non-blocking
      }
    }

    return {
      updated: updatedToml !== original,
      herdrTheme: herdrThemeName,
      sidebarBg: options.sidebarBg,
      autoSwitchDisabled,
    };
  } catch (err) {
    return {
      updated: false,
      herdrTheme: herdrThemeName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
