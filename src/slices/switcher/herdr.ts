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
  if (env.HERDR_CONFIG_PATH) return env.HERDR_CONFIG_PATH;
  if (platform === "win32") {
    const appData = env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "herdr", "config.toml");
  }
  if (env.XDG_CONFIG_HOME) return join(env.XDG_CONFIG_HOME, "herdr", "config.toml");
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

export interface UpdateTomlThemeResult {
  content: string;
  autoSwitchDisabled: boolean;
}

function extractInlineComment(line: string): string {
  const match =
    /^\s*[\w.]+\s*=\s*(?:"(?:[^"\\]|\\.)*"|'[^']*'|[^\s#]+)(\s*#.*)?$/.exec(line);
  return match && match[1] ? match[1] : "";
}

/**
 * Updates or inserts the theme name in a TOML string.
 * Supports [theme] headers with comments/spaces, array-of-tables headers ([[keys.command]]),
 * top-level dotted theme.* keys, inline tables, and automatically disables auto_switch.
 */
export function updateTomlThemeDetails(
  tomlContent: string,
  newTheme: string,
): UpdateTomlThemeResult {
  const eol = tomlContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = tomlContent.split(/\r?\n/);
  let inThemeSection = false;
  let inAnySection = false;
  let nameReplaced = false;
  let hasThemeSection = false;
  let autoSwitchDisabled = false;
  const outputLines: string[] = [];

  // Pre-scan top-level lines before any section header ([...] or [[...]])
  let hasTopLevelThemeDotted = false;
  let hasTopLevelThemeInline = false;
  let hasTopLevelThemeName = false;
  let lastTopLevelThemeIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\[+/.test(line)) {
      break;
    }
    if (/^\s*theme\.[a-zA-Z0-9_-]+\s*=/.test(line)) {
      hasTopLevelThemeDotted = true;
      lastTopLevelThemeIdx = i;
      if (/^\s*theme\.name\s*=/.test(line)) {
        hasTopLevelThemeName = true;
      }
    }
    if (/^\s*theme\s*=\s*\{/.test(line)) {
      hasTopLevelThemeInline = true;
      lastTopLevelThemeIdx = i;
    }
  }

  function flushPendingThemeName(): void {
    if (inThemeSection && !nameReplaced) {
      const blanks: string[] = [];
      while (outputLines.length > 0 && outputLines.at(-1)?.trim() === "") {
        blanks.push(outputLines.pop()!);
      }
      outputLines.push(`name = "${newTheme}"`);
      while (blanks.length > 0) {
        outputLines.push(blanks.pop()!);
      }
      nameReplaced = true;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Matches standard table headers [section] and array-of-tables headers [[section]]
    // with optional comments: e.g. [theme] # comment, [[keys.command]]
    const sectionMatch = /^\s*(\[+)\s*([^\]]+?)\s*(\]+)(?:\s*#.*)?$/.exec(line);

    if (sectionMatch) {
      const openBrackets = sectionMatch[1];
      const sectionName = sectionMatch[2].trim();
      const closeBrackets = sectionMatch[3];

      // If we were inside [theme] and name hasn't been emitted yet, emit it before this new header
      flushPendingThemeName();

      // If we were at top level and had dotted theme keys without theme.name, insert it before first section
      if (!inAnySection && hasTopLevelThemeDotted && !nameReplaced) {
        outputLines.push(`theme.name = "${newTheme}"`);
        nameReplaced = true;
      }

      inAnySection = true;

      // Only a single-bracket [theme] header opens the Herdr theme section table
      inThemeSection =
        openBrackets === "[" &&
        closeBrackets === "]" &&
        sectionName.toLowerCase() === "theme";

      if (inThemeSection) {
        hasThemeSection = true;
      }
      outputLines.push(line);
      continue;
    }

    // Top-level theme handling before any section
    if (!inAnySection) {
      const inlineMatch = hasTopLevelThemeInline
        ? /^\s*theme\s*=\s*\{(.*)\}(\s*#.*)?$/.exec(line)
        : null;
      if (inlineMatch) {
        let inner = inlineMatch[1];
        const comment = inlineMatch[2] ?? "";
        if (/name\s*=\s*"[^"]*"/.test(inner)) {
          inner = inner.replace(/name\s*=\s*"[^"]*"/, `name = "${newTheme}"`);
        } else {
          inner = inner.trim()
            ? `name = "${newTheme}", ${inner.trim()}`
            : `name = "${newTheme}"`;
        }
        if (/auto_switch\s*=\s*true\b/.test(inner)) {
          inner = inner.replace(/auto_switch\s*=\s*true\b/, "auto_switch = false");
          autoSwitchDisabled = true;
        }
        outputLines.push(`theme = { ${inner.trim()} }${comment}`);
        nameReplaced = true;
        continue;
      }

      if (hasTopLevelThemeDotted) {
        if (/^\s*theme\.name\s*=/.test(line)) {
          outputLines.push(`theme.name = "${newTheme}"${extractInlineComment(line)}`);
          nameReplaced = true;
          continue;
        }
        if (/^\s*theme\.auto_switch\s*=\s*true\b/.test(line)) {
          outputLines.push(`theme.auto_switch = false${extractInlineComment(line)}`);
          autoSwitchDisabled = true;
          if (i === lastTopLevelThemeIdx && !hasTopLevelThemeName && !nameReplaced) {
            outputLines.push(`theme.name = "${newTheme}"`);
            nameReplaced = true;
          }
          continue;
        }
        if (/^\s*theme\.[a-zA-Z0-9_-]+\s*=/.test(line)) {
          outputLines.push(line);
          if (i === lastTopLevelThemeIdx && !hasTopLevelThemeName && !nameReplaced) {
            outputLines.push(`theme.name = "${newTheme}"`);
            nameReplaced = true;
          }
          continue;
        }
      }
    }

    if (inThemeSection) {
      if (/^\s*name\s*=/.test(line)) {
        outputLines.push(`name = "${newTheme}"${extractInlineComment(line)}`);
        nameReplaced = true;
        continue;
      }
      if (/^\s*auto_switch\s*=\s*true\b/.test(line)) {
        outputLines.push(`auto_switch = false${extractInlineComment(line)}`);
        autoSwitchDisabled = true;
        continue;
      }
    }

    outputLines.push(line);
  }

  // If file ended while still in [theme], emit name before EOF
  flushPendingThemeName();

  // If file had top-level dotted theme keys and no sections at all, insert theme.name if still needed
  if (!inAnySection && hasTopLevelThemeDotted && !nameReplaced) {
    outputLines.push(`theme.name = "${newTheme}"`);
    nameReplaced = true;
  }

  // If no [theme] table or top-level theme key exists anywhere in the file, append a [theme] table
  if (!hasThemeSection && !hasTopLevelThemeDotted && !hasTopLevelThemeInline) {
    const trimmed = tomlContent.trim();
    const prefix = trimmed ? `${trimmed}${eol}${eol}` : "";
    return {
      content: `${prefix}[theme]${eol}name = "${newTheme}"${eol}auto_switch = false${eol}`,
      autoSwitchDisabled,
    };
  }

  return {
    content: outputLines.join(eol),
    autoSwitchDisabled,
  };
}

/**
 * Updates or inserts the [theme] name = "..." in a TOML string.
 * Supports [theme] headers with comments/spaces, array-of-tables headers,
 * dotted theme.name keys, and disables auto_switch so Herdr honors the circadian theme.
 *
 * Note: Line-based parser designed for Herdr's config schema; does not support multiline """...""" strings.
 */
export function updateTomlTheme(tomlContent: string, newTheme: string): string {
  return updateTomlThemeDetails(tomlContent, newTheme).content;
}

export interface SyncHerdrOptions {
  configPath?: string;
  reloadServer?: boolean;
}

export interface SyncHerdrResult {
  updated: boolean;
  herdrTheme: string;
  autoSwitchDisabled?: boolean;
  error?: string;
}

/**
 * Synchronize the Herdr theme in config.toml and reload the Herdr server.
 */
export function syncHerdrTheme(
  herdrThemeName: string,
  options: SyncHerdrOptions = {},
): SyncHerdrResult {
  const configPath = options.configPath ?? defaultHerdrConfigPath();
  const reloadServer = options.reloadServer ?? true;

  try {
    let original = "";
    if (existsSync(configPath)) {
      original = readFileSync(configPath, "utf8");
    }

    const { content: updatedToml, autoSwitchDisabled } = updateTomlThemeDetails(
      original,
      herdrThemeName,
    );
    if (updatedToml !== original) {
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, updatedToml, "utf8");
    }

    if (reloadServer) {
      try {
        const pathSeparator = process.platform === "win32" ? ";" : ":";
        const extraPaths =
          process.platform === "win32"
            ? [join(homedir(), ".herdr", "bin"), join(homedir(), ".cargo", "bin")]
            : [join(homedir(), ".local", "bin"), join(homedir(), ".cargo", "bin"), "/usr/local/bin"];
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

    return {
      updated: updatedToml !== original,
      herdrTheme: herdrThemeName,
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
