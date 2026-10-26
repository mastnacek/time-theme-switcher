/**
 * Packaged-theme tests: the palettes under themes/ ship with the plugin, so a
 * fresh install must resolve every slot default without the user adding files.
 * These tests fail loudly when a theme file, its name, or the slot mapping
 * drifts — the failure mode users cannot diagnose from the UI.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { DEFAULT_SLOT_THEMES } from "../src/shared/settings.ts";
// @ts-expect-error — plain ESM guard script, no type declarations shipped
import { PACKAGED_THEME_FILES, SHIPPED_THEMES, verifyThemes } from "./verify-themes.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

describe("packaged themes", () => {
  it("every shipped theme file is valid and matches its slot default", () => {
    const { ok, problems } = verifyThemes();
    assert.deepEqual(problems, []);
    assert.equal(ok, true);
  });

  it("declares the theme directory in the pi manifest", () => {
    assert.deepEqual(PKG.pi.themes, ["./themes/*.json"]);
  });

  it("ships the theme directory in the published files list", () => {
    assert.ok(PKG.files.includes("themes"), "files[] must include themes");
  });

  it("maps every slot to a theme name the plugin ships", () => {
    const shipped = new Set(Object.values(SHIPPED_THEMES));
    for (const [slot, name] of Object.entries(DEFAULT_SLOT_THEMES)) {
      assert.ok(shipped.has(name), `slot ${slot} -> ${name} is not a shipped theme`);
      assert.equal(name, SHIPPED_THEMES[slot as keyof typeof SHIPPED_THEMES]);
    }
  });

  it("keeps packaged theme names prefixed so user themes never collide", () => {
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
});
