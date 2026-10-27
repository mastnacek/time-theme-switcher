/**
 * Switcher slice — Terminal background and foreground color synchronization.
 * Uses standard Operating System Command (OSC) escape sequences:
 * - OSC 10: \x1b]10;#RRGGBB\x07 — sets the host terminal foreground (font) color.
 * - OSC 11: \x1b]11;#RRGGBB\x07 — sets the host terminal background color.
 * - OSC 110: \x1b]110\x07 — resets terminal foreground color to profile default.
 * - OSC 111: \x1b]111\x07 — resets terminal background color to profile default.
 * Supported by Windows Terminal (>=1.11), WezTerm, Alacritty, Ghostty, Kitty, iTerm2, etc.
 */

import { existsSync, readFileSync } from "node:fs";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { colorToHex, parseColor } from "@earendil-works/pi-tui";
import { getBundledThemeBg, getBundledThemeFg } from "../../shared/palettes.ts";

export interface TerminalStream {
  isTTY?: boolean;
  write(data: string): unknown;
}

/**
 * Emit OSC 11 sequence to set the terminal background color to a 6-digit hex string.
 * Skips emission if stream is explicitly not a TTY.
 */
export function syncTerminalBackground(
  hexColor: string,
  stream: TerminalStream = process.stdout,
): void {
  if (stream.isTTY !== false) {
    stream.write(`\x1b]11;${hexColor}\x07`);
  }
}

/**
 * Emit OSC 111 sequence to restore the terminal background color back to its profile default.
 * Skips emission if stream is explicitly not a TTY.
 */
export function resetTerminalBackground(
  stream: TerminalStream = process.stdout,
): void {
  if (stream.isTTY !== false) {
    stream.write("\x1b]111\x07");
  }
}

/**
 * Emit OSC 10 sequence to set the terminal foreground (font) color to a 6-digit hex string.
 * Skips emission if stream is explicitly not a TTY.
 */
export function syncTerminalForeground(
  hexColor: string,
  stream: TerminalStream = process.stdout,
): void {
  if (stream.isTTY !== false) {
    stream.write(`\x1b]10;${hexColor}\x07`);
  }
}

/**
 * Emit OSC 110 sequence to restore the terminal foreground (font) color back to its profile default.
 * Skips emission if stream is explicitly not a TTY.
 */
export function resetTerminalForeground(
  stream: TerminalStream = process.stdout,
): void {
  if (stream.isTTY !== false) {
    stream.write("\x1b]110\x07");
  }
}

/**
 * Normalizes any CSS/Pi color string (hex, rgb, okhsl, oklch) into a canonical 6-digit #RRGGBB.
 * Returns undefined if parsing fails.
 */
export function toHexColor(colorStr: string): string | undefined {
  try {
    const trimmed = colorStr.trim();
    if (!trimmed) return undefined;
    const parsed = parseColor(trimmed);
    return colorToHex(parsed);
  } catch {
    return undefined;
  }
}

/**
 * Resolves the background hex color for a given theme name:
 * 1. Checks bundled palettes (vars.bg, colors.bg, etc.)
 * 2. Checks registered Pi themes via ui.getAllThemes() when available
 */
export function resolveThemeBgHex(
  themeName: string,
  ui?: ExtensionUIContext,
): string | undefined {
  // 1. Check bundled palettes
  const bundledBg = getBundledThemeBg(themeName);
  if (bundledBg) {
    const hex = toHexColor(bundledBg);
    if (hex) return hex;
  }

  // 2. Check registered Pi themes if UI is available
  if (ui && typeof ui.getAllThemes === "function") {
    try {
      const all = ui.getAllThemes();
      const match = all.find((t) => t.name === themeName);
      if (match?.path && existsSync(match.path)) {
        const raw = readFileSync(match.path, "utf8");
        const json = JSON.parse(raw);
        const bgVal = json.vars?.bg ?? json.colors?.bg ?? json.colors?.background;
        if (typeof bgVal === "string" && bgVal.trim()) {
          const hex = toHexColor(bgVal);
          if (hex) return hex;
        }
      }
    } catch {
      // Non-critical: fail closed to undefined
    }
  }

  return undefined;
}

/**
 * Resolves the foreground (font/text) hex color for a given theme name:
 * 1. Checks bundled palettes (vars.fg, colors.text, colors.foreground)
 * 2. Checks registered Pi themes via ui.getAllThemes() when available
 */
export function resolveThemeFgHex(
  themeName: string,
  ui?: ExtensionUIContext,
): string | undefined {
  // 1. Check bundled palettes
  const bundledFg = getBundledThemeFg(themeName);
  if (bundledFg) {
    const hex = toHexColor(bundledFg);
    if (hex) return hex;
  }

  // 2. Check registered Pi themes if UI is available
  if (ui && typeof ui.getAllThemes === "function") {
    try {
      const all = ui.getAllThemes();
      const match = all.find((t) => t.name === themeName);
      if (match?.path && existsSync(match.path)) {
        const raw = readFileSync(match.path, "utf8");
        const json = JSON.parse(raw);
        const fgVal =
          json.vars?.fg ?? json.colors?.text ?? json.colors?.foreground;
        if (typeof fgVal === "string" && fgVal.trim()) {
          const hex = toHexColor(fgVal);
          if (hex) return hex;
        }
      }
    } catch {
      // Non-critical: fail closed to undefined
    }
  }

  return undefined;
}
