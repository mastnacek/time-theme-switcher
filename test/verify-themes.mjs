/**
 * Guard for the palettes shipped with the plugin (themes/*.json).
 *
 * Two invariants keep a packaged theme usable on a fresh install:
 *   1. The file must be a valid Pi theme (engine's own loader accepts it).
 *   2. Its `name` must match the slot defaults in src/shared/settings.ts, so
 *      setTheme() finds the theme the rotation applies. A mismatch here is the
 *      one failure a user cannot diagnose from the UI — the theme simply never
 *      appears in the picker.
 *
 * Run via `npm run themes:verify`; also executed by the settings test suite.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const THEMES_DIR = join(ROOT, "themes");

/** Slot -> shipped theme file name. Mirrors DEFAULT_SLOT_THEMES. */
export const SHIPPED_THEMES = {
  dawn: "tts-dawn",
  day: "tts-day",
  dusk: "tts-dusk",
  night: "tts-osaka-jade",
};

/** Themes the settings UI advertises as "recommended default" per slot. */
export const PACKAGED_THEME_FILES = [
  "tts-dawn.json",
  "tts-day.json",
  "tts-dusk.json",
  "tts-night.json",
  "tts-osaka-jade.json",
];

/** Required top-level color keys per the Pi theme schema. */
const REQUIRED_COLORS = [
  "accent",
  "border",
  "borderAccent",
  "borderMuted",
  "success",
  "error",
  "warning",
  "muted",
  "dim",
  "text",
  "thinkingText",
  "selectedBg",
  "userMessageBg",
  "userMessageText",
  "customMessageBg",
  "customMessageText",
  "customMessageLabel",
  "toolPendingBg",
  "toolSuccessBg",
  "toolErrorBg",
  "toolTitle",
  "toolOutput",
  "mdHeading",
  "mdLink",
  "mdLinkUrl",
  "mdCode",
  "mdCodeBlock",
  "mdCodeBlockBorder",
  "mdQuote",
  "mdQuoteBorder",
  "mdHr",
  "mdListBullet",
  "toolDiffAdded",
  "toolDiffRemoved",
  "toolDiffContext",
  "syntaxComment",
  "syntaxKeyword",
  "syntaxFunction",
  "syntaxVariable",
  "syntaxString",
  "syntaxNumber",
  "syntaxType",
  "syntaxOperator",
  "syntaxPunctuation",
  "thinkingOff",
  "thinkingMinimal",
  "thinkingLow",
  "thinkingMedium",
  "thinkingHigh",
  "thinkingXhigh",
  "bashMode",
];

export function readTheme(fileName) {
  const path = join(THEMES_DIR, fileName);
  const raw = JSON.parse(readFileSync(path, "utf8"));
  return { path, raw };
}

/**
 * Validate every packaged theme file.
 * @returns {{ ok: boolean, problems: string[], themes: Array<{file: string, name: string, appearance?: string}> }}
 */
export function verifyThemes() {
  const problems = [];
  const themes = [];

  for (const file of PACKAGED_THEME_FILES) {
    let raw;
    try {
      ({ raw } = readTheme(file));
    } catch (error) {
      problems.push(`${file}: unreadable or invalid JSON (${error.message})`);
      continue;
    }

    if (typeof raw.name !== "string" || raw.name.length === 0) {
      problems.push(`${file}: missing "name"`);
      continue;
    }
    if (raw.name !== file.replace(/\.json$/, "")) {
      problems.push(`${file}: name "${raw.name}" does not match the file name`);
    }
    if (raw.appearance !== "dark" && raw.appearance !== "light") {
      problems.push(`${file}: "appearance" must be "dark" or "light" (got ${JSON.stringify(raw.appearance)})`);
    }

    const colors = raw.colors ?? {};
    const missing = REQUIRED_COLORS.filter((key) => !(key in colors));
    if (missing.length > 0) {
      problems.push(`${file}: missing required colors: ${missing.join(", ")}`);
    }

    // A color value must be a variable name defined in vars, or a literal.
    const vars = raw.vars ?? {};
    for (const [key, value] of Object.entries(colors)) {
      if (typeof value !== "string" || value === "") continue;
      const looksLikeVariable = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);
      if (looksLikeVariable && !(value in vars)) {
        problems.push(`${file}: colors.${key} references unknown var "${value}"`);
      }
    }

    themes.push({ file, name: raw.name, appearance: raw.appearance });
  }

  // Every slot default must resolve to a packaged theme.
  for (const [slot, themeName] of Object.entries(SHIPPED_THEMES)) {
    const found = themes.some((t) => t.name === themeName);
    if (!found) {
      problems.push(`slot "${slot}" defaults to "${themeName}", which is not a packaged theme`);
    }
  }

  return { ok: problems.length === 0, problems, themes };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  const { ok, problems, themes } = verifyThemes();
  for (const theme of themes) {
    console.log(`OK  ${theme.file.padEnd(20)} name=${theme.name} appearance=${theme.appearance}`);
  }
  for (const problem of problems) {
    console.error(`ERR ${problem}`);
  }
  console.log(`\n${themes.length} theme(s) checked, ${problems.length} problem(s)`);
  process.exit(ok ? 0 : 1);
}
