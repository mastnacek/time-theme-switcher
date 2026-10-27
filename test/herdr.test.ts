/** Herdr multiplexer theme synchronization tests: slot mapping, TOML editing, and sync behavior. */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  resolveHerdrTheme,
  syncHerdrTheme,
  updateTomlTheme,
} from "../src/slices/switcher/herdr.ts";

describe("resolveHerdrTheme", () => {
  it("resolves built-in solar slots to corresponding Herdr themes", () => {
    assert.equal(resolveHerdrTheme("day", "tts-day"), "solarized-light");
    assert.equal(resolveHerdrTheme("dawn", "tts-dawn"), "gruvbox");
    assert.equal(resolveHerdrTheme("dusk", "tts-dusk"), "catppuccin");
    assert.equal(resolveHerdrTheme("night", "tts-night"), "rose-pine");
    assert.equal(resolveHerdrTheme("night", "tts-osaka-jade"), "rose-pine");
  });

  it("resolves third-party themes by name pattern or appearance fallback", () => {
    assert.equal(resolveHerdrTheme("day", "my-solarized-light-theme"), "solarized-light");
    assert.equal(resolveHerdrTheme("day", "tokyo-custom", "light"), "tokyo-night-day");
    assert.equal(resolveHerdrTheme("night", "tokyo-custom", "dark"), "tokyo-night");
    assert.equal(resolveHerdrTheme("day", "custom-nord"), "nord");
    assert.equal(resolveHerdrTheme("unknown", "unrecognized", "light"), "solarized-light");
    assert.equal(resolveHerdrTheme("unknown", "unrecognized", "dark"), "catppuccin");
  });
});

describe("updateTomlTheme", () => {
  it("appends [theme] section to empty or non-theme toml", () => {
    const emptyResult = updateTomlTheme("", "solarized-light");
    assert.match(emptyResult, /\[theme\]/);
    assert.match(emptyResult, /name = "solarized-light"/);

    const otherConfig = "[terminal]\nshell = \"bash\"\n";
    const result = updateTomlTheme(otherConfig, "catppuccin");
    assert.match(result, /\[terminal\]/);
    assert.match(result, /\[theme\]/);
    assert.match(result, /name = "catppuccin"/);
  });

  it("replaces existing name under [theme] section", () => {
    const existing = `
[theme]
name = "dracula"
auto_switch = false

[terminal]
shell = "pwsh"
`.trim();

    const result = updateTomlTheme(existing, "rose-pine");
    assert.match(result, /name = "rose-pine"/);
    assert.ok(!result.includes('name = "dracula"'));
    assert.match(result, /auto_switch = false/);
    assert.match(result, /\[terminal\]/);
  });

  it("inserts name under existing [theme] section if name was missing", () => {
    const existing = `
[theme]
auto_switch = true

[terminal]
shell = "pwsh"
`.trim();

    const result = updateTomlTheme(existing, "gruvbox");
    assert.match(result, /name = "gruvbox"/);
    assert.match(result, /auto_switch = true/);
  });
});

describe("syncHerdrTheme", () => {
  it("writes theme to config file", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-herdr-test-"));
    const configPath = join(dir, "config.toml");
    try {
      const res = syncHerdrTheme("solarized-light", { configPath, reloadServer: false });
      assert.equal(res.updated, true);
      assert.equal(res.herdrTheme, "solarized-light");

      const content = readFileSync(configPath, "utf8");
      assert.match(content, /name = "solarized-light"/);

      // Second sync with same theme should report updated: false
      const res2 = syncHerdrTheme("solarized-light", { configPath, reloadServer: false });
      assert.equal(res2.updated, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
