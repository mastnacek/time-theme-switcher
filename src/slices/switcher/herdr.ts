/**
 * Switcher slice — Herdr multiplexer theme synchronization.
 * Updates theme name in the platform Herdr config.toml (%APPDATA%\herdr\config.toml
 * on Windows, ~/.config/herdr/config.toml on Unix/macOS, or HERDR_CONFIG_PATH)
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
 * 3. ~/Library/Application Support/herdr/config.toml on macOS (darwin).
 * 4. $XDG_CONFIG_HOME/herdr/config.toml or ~/.config/herdr/config.toml on Linux / other Unix.
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
  if (platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "herdr", "config.toml");
  }
  if (env.XDG_CONFIG_HOME) {
    return join(env.XDG_CONFIG_HOME, "herdr", "config.toml");
  }
  return join(homedir(), ".config", "herdr", "config.toml");
}

/**
 * Maps a solar slot or Pi theme name to an appropriate Herdr built-in theme.
 */
export function resolveHerdrTheme(
  slot: string,
  themeName: string,
  appearance?: "dark" | "light",
): string {
  const lower = themeName.toLowerCase();
  if (lower.includes("solarized-light") || lower === "tts-day") return "solarized-light";
  if (lower.includes("gruvbox") || lower === "tts-dawn") return "gruvbox";
  if (lower.includes("catppuccin") || lower === "tts-dusk") return "catppuccin";
  if (
    lower.includes("rose-pine") ||
    lower === "tts-night" ||
    lower === "tts-osaka-jade"
  ) {
    return "rose-pine";
  }
  if (lower.includes("tokyo")) {
    return appearance === "light" ? "tokyo-night-day" : "tokyo-night";
  }
  if (lower.includes("nord")) return "nord";
  if (lower.includes("dracula")) return "dracula";
  if (lower.includes("one-light")) return "one-light";
  if (lower.includes("one-dark")) return "one-dark";

  if (slot in DEFAULT_HERDR_THEMES) {
    return DEFAULT_HERDR_THEMES[slot];
  }

  return appearance === "light" ? "solarized-light" : "catppuccin";
}

/**
 * Updates or inserts the [theme] name = "..." in a TOML string.
 */
export function updateTomlTheme(tomlContent: string, newTheme: string): string {
  const eol = tomlContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = tomlContent.split(/\r?\n/);
  let inTheme = false;
  let nameReplaced = false;
  let hasThemeSection = false;
  const outputLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isSectionHeader = /^\s*\[.+\]/.test(line);

    if (isSectionHeader) {
      if (inTheme && !nameReplaced) {
        outputLines.push(`name = "${newTheme}"`);
        nameReplaced = true;
      }
      inTheme = /^\s*\[theme\]\s*$/.test(line);
      if (inTheme) hasThemeSection = true;
    } else if (inTheme && /^\s*name\s*=/.test(line)) {
      outputLines.push(`name = "${newTheme}"`);
      nameReplaced = true;
      continue;
    }
    outputLines.push(line);
  }

  if (inTheme && !nameReplaced) {
    outputLines.push(`name = "${newTheme}"`);
    nameReplaced = true;
  }

  if (!hasThemeSection) {
    const trimmed = tomlContent.trim();
    const prefix = trimmed ? `${trimmed}${eol}${eol}` : "";
    return `${prefix}[theme]${eol}name = "${newTheme}"${eol}`;
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
