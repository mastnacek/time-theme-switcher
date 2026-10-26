/**
 * Bundled-palette tests: the palettes under themes/ ship as PRIVATE data
 * files. They must NOT be declared under pi.themes (Pi would register them
 * globally) — the plugin builds them as in-memory Theme instances and applies
 * them via ui.setTheme(instance), which bypasses the registry. These tests
 * fail loudly when the files, their names, or the slot mapping drift.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  BUNDLED_PALETTE_FILES,
  bundledThemeNames,
  bundledThemes,
  resolveBundledTheme,
} from "../src/shared/palettes.ts";
import { DEFAULT_SLOT_THEMES } from "../src/shared/settings.ts";
// @ts-expect-error — plain ESM guard script, no type declarations shipped
import { PACKAGED_THEME_FILES, SHIPPED_THEMES, verifyThemes } from "./verify-themes.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("bundled palettes (private, not registered)", () => {
  it("every shipped palette file is valid and matches its slot default", () => {
    const { ok, problems } = verifyThemes();
    assert.deepEqual(problems, []);
    assert.equal(ok, true);
  });

  it("does NOT declare themes in the pi manifest (must stay private)", () => {
    assert.equal(PKG.pi.themes, undefined, "pi.themes must be absent — bundled palettes are private");
  });

  it("ships the palette directory in the published files list", () => {
    assert.ok(PKG.files.includes("themes"), "files[] must include themes");
  });

  it("maps every slot to a palette name the plugin ships", () => {
    const shipped = new Set(Object.values(SHIPPED_THEMES));
    for (const [slot, name] of Object.entries(DEFAULT_SLOT_THEMES)) {
      assert.ok(shipped.has(name), `slot ${slot} -> ${name} is not a shipped palette`);
      assert.equal(name, SHIPPED_THEMES[slot as keyof typeof SHIPPED_THEMES]);
    }
  });

  it("keeps palette names prefixed so user themes never collide", () => {
    for (const file of PACKAGED_THEME_FILES) {
      const raw = JSON.parse(readFileSync(join(ROOT, "themes", file), "utf8"));
      assert.match(raw.name, /^tts-/, `${file} name must carry the tts- prefix`);
      assert.equal(raw.name, file.replace(/\.json$/, ""));
    }
  });

  it("ships all five palettes referenced by the README table", () => {
    const names = PACKAGED_THEME_FILES.map((f: string) => f.replace(/\.json$/, "")).sort();
    assert.deepEqual(names, [
      "tts-dawn",
      "tts-day",
      "tts-dusk",
      "tts-night",
      "tts-osaka-jade",
    ]);
  });

  it("exposes the same set through the palette loader", () => {
    assert.deepEqual(bundledThemeNames(), [
      "tts-dawn",
      "tts-day",
      "tts-dusk",
      "tts-night",
      "tts-osaka-jade",
    ]);
    assert.deepEqual([...bundledThemes().keys()].sort(), bundledThemeNames());
    assert.deepEqual(BUNDLED_PALETTE_FILES.map((f) => f.replace(/\.json$/, "")).sort(), bundledThemeNames());
  });

  it("builds every palette as a real Theme instance", () => {
    for (const name of bundledThemeNames()) {
      const theme = resolveBundledTheme(name);
      assert.ok(theme, `${name} must load`);
      assert.equal(theme!.name, name);
      // Smoke check: style() must produce ANSI for a fg+bg token pair.
      const styled = theme!.style("x", { fg: "accent", bg: "userMessageBg" });
      assert.match(styled, /\x1b\[/, `${name}.style() must emit ANSI`);
    }
  });

  it("resolves chained vars references in the palette JSON", () => {
    // tts-osaka-jade uses vars+refs; resolveBundledTheme would have thrown
    // while building it if resolution was wrong.
    const theme = resolveBundledTheme("tts-osaka-jade");
    assert.ok(theme);
    assert.equal(theme!.name, "tts-osaka-jade");
  });
});
