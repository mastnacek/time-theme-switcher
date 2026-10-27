/** Herdr multiplexer theme synchronization tests: slot mapping, TOML editing, and sync behavior. */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  defaultHerdrConfigPath,
  resolveHerdrTheme,
  syncHerdrTheme,
  updateTomlTheme,
} from "../src/slices/switcher/herdr.ts";

describe("defaultHerdrConfigPath", () => {
  it("prioritizes HERDR_CONFIG_PATH when provided", () => {
    const custom = "/custom/path/to/herdr.toml";
    assert.equal(
      defaultHerdrConfigPath({ HERDR_CONFIG_PATH: custom }, "linux"),
      custom,
    );
    assert.equal(
      defaultHerdrConfigPath({ HERDR_CONFIG_PATH: custom }, "win32"),
      custom,
    );
  });

  it("resolves to %APPDATA%\\herdr\\config.toml on Windows", () => {
    const res = defaultHerdrConfigPath(
      { APPDATA: "C:\\Users\\test\\AppData\\Roaming" },
      "win32",
    );
    assert.equal(res, join("C:\\Users\\test\\AppData\\Roaming", "herdr", "config.toml"));
  });

  it("resolves to XDG_CONFIG_HOME or ~/.config/herdr/config.toml on Unix", () => {
    const resXdg = defaultHerdrConfigPath(
      { XDG_CONFIG_HOME: "/home/test/.myconfig" },
      "linux",
    );
    assert.equal(resXdg, join("/home/test/.myconfig", "herdr", "config.toml"));

    const resDefault = defaultHerdrConfigPath({}, "linux");
    assert.match(resDefault, /\.config[/\\]herdr[/\\]config\.toml$/);
  });

  it("resolves to ~/.config/herdr/config.toml on macOS and Linux", () => {
    const resDarwin = defaultHerdrConfigPath({}, "darwin");
    assert.match(resDarwin, /\.config[/\\]herdr[/\\]config\.toml$/);

    const resLinux = defaultHerdrConfigPath({}, "linux");
    assert.match(resLinux, /\.config[/\\]herdr[/\\]config\.toml$/);
  });
});

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
    assert.equal(resolveHerdrTheme("night", "solarized-dark", "dark"), "solarized");
    assert.equal(resolveHerdrTheme("day", "gruvbox-soft", "light"), "gruvbox-light");
    assert.equal(resolveHerdrTheme("night", "gruvbox-soft", "dark"), "gruvbox");
    assert.equal(resolveHerdrTheme("day", "catppuccin-latte", "light"), "catppuccin-latte");
    assert.equal(resolveHerdrTheme("night", "catppuccin-mocha", "dark"), "catppuccin");
    assert.equal(resolveHerdrTheme("day", "rose-pine-dawn", "light"), "rose-pine-dawn");
    assert.equal(resolveHerdrTheme("night", "rose-pine-moon", "dark"), "rose-pine");
    assert.equal(resolveHerdrTheme("day", "kanagawa-lotus", "light"), "kanagawa-lotus");
    assert.equal(resolveHerdrTheme("night", "kanagawa-wave", "dark"), "kanagawa");
    assert.equal(resolveHerdrTheme("day", "one-light", "light"), "one-light");
    assert.equal(resolveHerdrTheme("night", "one-dark", "dark"), "one-dark");
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

  it("inserts name and disables auto_switch under existing [theme] section", () => {
    const existing = `
[theme]
auto_switch = true

[terminal]
shell = "pwsh"
`.trim();

    const result = updateTomlTheme(existing, "gruvbox");
    assert.match(result, /name = "gruvbox"/);
    assert.match(result, /auto_switch = false/);
    assert.equal((result.match(/\[theme\]/g) || []).length, 1);
  });

  it("handles [theme] section headers with comments and whitespace", () => {
    const existing = `
[theme] # User theme configuration
# Built-in themes: catppuccin, gruvbox, etc.
name = "dracula"
auto_switch = true

[ui]
sidebar_width = 24
`.trim();

    const result = updateTomlTheme(existing, "catppuccin-latte");
    assert.match(result, /name = "catppuccin-latte"/);
    assert.match(result, /auto_switch = false/);
    assert.equal((result.match(/\[theme\]/g) || []).length, 1);
    assert.match(result, /\[ui\]/);
  });

  it("handles top-level dotted theme.name and theme.auto_switch keys", () => {
    const dotted = `
theme.name = "nord"
theme.auto_switch = true

[terminal]
shell = "bash"
`.trim();

    const result = updateTomlTheme(dotted, "solarized-light");
    assert.match(result, /theme\.name = "solarized-light"/);
    assert.match(result, /theme\.auto_switch = false/);
    assert.ok(!result.includes("[theme]"), "does not append [theme] section when dotted key is present");
  });

  it("preserves CRLF line endings when present", () => {
    const crlf = "[theme]\r\nname = \"dracula\"\r\n\r\n[terminal]\r\nshell = \"pwsh\"\r\n";
    const res = updateTomlTheme(crlf, "gruvbox");
    assert.ok(res.includes("\r\n"), "maintains CRLF");
    assert.match(res, /name = "gruvbox"/);
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
