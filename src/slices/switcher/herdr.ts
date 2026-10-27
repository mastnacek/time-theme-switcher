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
  if (env.HERDR_CONFIG_PATH) {
    return env.HERDR_CONFIG_PATH;
  }
  if (platform === "win32") {
    const appData = env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "herdr", "config.toml");
  }
  if (env.XDG_CONFIG_HOME) {
    return join(env.XDG_CONFIG_HOME, "herdr", "config.toml");
  }
  return join(homedir(), ".config", "herdr", "config.toml");
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
  const isLight =
    appearance === "light" ||
    lower.includes("light") ||
    lower.includes("latte") ||
    lower.includes("lotus") ||
    lower.includes("dawn") ||
    lower.includes("day");

  // Specific bundled theme instances
  if (lower === "tts-day") return "solarized-light";
  if (lower === "tts-dawn") return "gruvbox";
  if (lower === "tts-dusk") return "catppuccin";
  if (lower === "tts-night" || lower === "tts-osaka-jade") return "rose-pine";

  // Family checks with light/dark counterparts
  if (lower.includes("solarized")) {
    return isLight ? "solarized-light" : "solarized";
  }
  if (lower.includes("gruvbox")) {
    return isLight ? "gruvbox-light" : "gruvbox";
  }
  if (lower.includes("catppuccin")) {
    return isLight ? "catppuccin-latte" : "catppuccin";
  }
  if (lower.includes("rose-pine")) {
    return isLight ? "rose-pine-dawn" : "rose-pine";
  }
  if (lower.includes("tokyo")) {
    return isLight ? "tokyo-night-day" : "tokyo-night";
  }
  if (lower.includes("kanagawa")) {
    return isLight ? "kanagawa-lotus" : "kanagawa";
  }
  if (lower.includes("one")) {
    return isLight ? "one-light" : "one-dark";
  }

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

/**
 * Updates or inserts the [theme] name = "..." in a TOML string.
 * Supports [theme] headers with comments/spaces, dotted theme.name keys,
 * and disables auto_switch so Herdr honors the circadian theme.
 */
export function updateTomlTheme(tomlContent: string, newTheme: string): string {
  const eol = tomlContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = tomlContent.split(/\r?\n/);
  let inThemeSection = false;
  let nameReplaced = false;
  let hasThemeSection = false;
  let hasDottedThemeName = false;
  const outputLines: string[] = [];

  // Check if dotted key `theme.name = ...` is defined before any section table
  let inAnySection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\[.+\]/.test(line)) {
      inAnySection = true;
      break;
    }
    if (!inAnySection && /^\s*theme\.name\s*=/.test(line)) {
      hasDottedThemeName = true;
      break;
    }
  }

  inAnySection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sectionMatch = /^\s*\[\s*([^\]]+?)\s*\](?:\s*#.*)?$/.exec(line);

    if (sectionMatch) {
      inAnySection = true;
      if (inThemeSection && !nameReplaced) {
        outputLines.push(`name = "${newTheme}"`);
        nameReplaced = true;
      }
      inThemeSection = sectionMatch[1].trim().toLowerCase() === "theme";
      if (inThemeSection) {
        hasThemeSection = true;
      }
      outputLines.push(line);
      continue;
    }

    if (hasDottedThemeName && !inAnySection) {
      if (/^\s*theme\.name\s*=/.test(line)) {
        outputLines.push(`theme.name = "${newTheme}"`);
        nameReplaced = true;
        continue;
      }
      if (/^\s*theme\.auto_switch\s*=\s*true\b/.test(line)) {
        outputLines.push("theme.auto_switch = false");
        continue;
      }
    }

    if (inThemeSection) {
      if (/^\s*name\s*=/.test(line)) {
        outputLines.push(`name = "${newTheme}"`);
        nameReplaced = true;
        continue;
      }
      if (/^\s*auto_switch\s*=\s*true\b/.test(line)) {
        // Circadian switcher controls active theme via name = "..."; disable auto_switch
        outputLines.push("auto_switch = false");
        continue;
      }
    }

    outputLines.push(line);
  }

  if (inThemeSection && !nameReplaced) {
    outputLines.push(`name = "${newTheme}"`);
    nameReplaced = true;
  }

  if (!hasThemeSection && !hasDottedThemeName) {
    const trimmed = tomlContent.trim();
    const prefix = trimmed ? `${trimmed}${eol}${eol}` : "";
    return `${prefix}[theme]${eol}name = "${newTheme}"${eol}auto_switch = false${eol}`;
  }

  return outputLines.join(eol);
}

export interface SyncHerdrOptions {
  configPath?: string;
  reloadServer?: boolean;
}

/**
 * Synchronize the Herdr theme in config.toml and reload the Herdr server.
 */
export function syncHerdrTheme(
  herdrThemeName: string,
  options: SyncHerdrOptions = {},
): { updated: boolean; herdrTheme: string; error?: string } {
  const configPath = options.configPath ?? defaultHerdrConfigPath();
  const reloadServer = options.reloadServer ?? true;

  try {
    let original = "";
    if (existsSync(configPath)) {
      original = readFileSync(configPath, "utf8");
    }

    const updatedToml = updateTomlTheme(original, herdrThemeName);
    if (updatedToml !== original) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, updatedToml, "utf8");
    }

    if (reloadServer) {
      try {
        const pathSeparator = process.platform === "win32" ? ";" : ":";
        const extraPaths =
          process.platform === "win32"
            ? [
                join(homedir(), ".herdr", "bin"),
                join(homedir(), ".cargo", "bin"),
              ]
            : [
                join(homedir(), ".local", "bin"),
                join(homedir(), ".cargo", "bin"),
                "/usr/local/bin",
              ];
        const currentPath = process.env.PATH ?? "";
        const envPath = `${currentPath}${pathSeparator}${extraPaths.join(pathSeparator)}`;

        const child = execFile(
          "herdr",
          ["server", "reload-config"],
          {
            windowsHide: true,
            env: { ...process.env, PATH: envPath },
          },
          () => {
            // Non-blocking: ignore error when Herdr server is not running or CLI is absent
          },
        );
        child.unref();
      } catch {
        // Safe: non-blocking
      }
    }

    return { updated: updatedToml !== original, herdrTheme: herdrThemeName };
  } catch (err) {
    return {
      updated: false,
      herdrTheme: herdrThemeName,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
