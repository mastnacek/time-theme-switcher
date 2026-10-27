/**
 * Switcher slice — Herdr multiplexer theme synchronization.
 * Updates theme name in ~/.config/herdr/config.toml and triggers
 * `herdr server reload-config` to apply changes live.
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

/** Default config path for Herdr multiplexer: ~/.config/herdr/config.toml */
export function defaultHerdrConfigPath(): string {
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
    const prefix = trimmed ? `${trimmed}\n\n` : "";
    return `${prefix}[theme]\nname = "${newTheme}"\n`;
  }

  return outputLines.join("\n");
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
        const child = execFile(
          "herdr",
          ["server", "reload-config"],
          { windowsHide: true },
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
