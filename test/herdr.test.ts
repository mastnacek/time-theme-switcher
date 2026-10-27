/** Herdr multiplexer theme synchronization tests: slot mapping, TOML editing, and sync behavior. */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parse } from "smol-toml";
import {
  defaultHerdrConfigPath,
  resolveHerdrTheme,
  syncHerdrTheme,
  updateTomlTheme,
  updateTomlThemeDetails,
} from "../src/slices/switcher/herdr.ts";

describe("defaultHerdrConfigPath", () => {
  it("prioritizes HERDR_CONFIG_PATH when provided", () => {
    const custom = "/custom/path/to/herdr.toml";
    assert.equal(defaultHerdrConfigPath({ HERDR_CONFIG_PATH: custom }, "linux"), custom);
    assert.equal(defaultHerdrConfigPath({ HERDR_CONFIG_PATH: custom }, "win32"), custom);
  });

  it("resolves to %APPDATA%\\herdr\\config.toml on Windows", () => {
    const res = defaultHerdrConfigPath({ APPDATA: "C:\\Users\\test\\AppData\\Roaming" }, "win32");
    assert.equal(res, join("C:\\Users\\test\\AppData\\Roaming", "herdr", "config.toml"));
  });

  it("resolves to XDG_CONFIG_HOME or ~/.config/herdr/config.toml on Unix", () => {
    const resXdg = defaultHerdrConfigPath({ XDG_CONFIG_HOME: "/home/test/.myconfig" }, "linux");
    assert.equal(resXdg, join("/home/test/.myconfig", "herdr", "config.toml"));
    assert.match(defaultHerdrConfigPath({}, "linux"), /\.config[/\\]herdr[/\\]config\.toml$/);
  });

  it("resolves to ~/.config/herdr/config.toml on macOS and Linux", () => {
    assert.match(defaultHerdrConfigPath({}, "darwin"), /\.config[/\\]herdr[/\\]config\.toml$/);
    assert.match(defaultHerdrConfigPath({}, "linux"), /\.config[/\\]herdr[/\\]config\.toml$/);
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

  it("does not falsely match substring 'one' in other themes (regression: everforest-honey)", () => {
    assert.notEqual(resolveHerdrTheme("night", "everforest-honey"), "one-dark");
    assert.equal(resolveHerdrTheme("night", "everforest-honey"), "rose-pine");
    assert.equal(resolveHerdrTheme("day", "everforest-honey"), "solarized-light");
  });

  it("prioritizes explicit 'dark' in theme name over day/dawn substring (non-tautological known family)", () => {
    // gruvbox family: if isLight -> gruvbox-light, else gruvbox
    // gruvbox-dawn-dark contains "dawn" (heuristic light) AND "dark".
    // Explicit "dark" must win without appearance set, resolving to "gruvbox", not "gruvbox-light".
    assert.equal(resolveHerdrTheme("night", "gruvbox-dawn-dark"), "gruvbox");
    assert.equal(resolveHerdrTheme("day", "gruvbox-dawn-dark"), "gruvbox");
    assert.equal(resolveHerdrTheme("night", "gruvbox-dawn"), "gruvbox-light");
  });
});

describe("updateTomlTheme (parsed TOML structural verification)", () => {
  it("appends [theme] section to empty or non-theme toml", () => {
    const emptyResult = updateTomlTheme("", "solarized-light");
    const p1 = parse(emptyResult) as any;
    assert.equal(p1.theme?.name, "solarized-light");
    assert.equal(p1.theme?.auto_switch, false);

    const result = updateTomlTheme("[terminal]\nshell = \"bash\"\n", "catppuccin");
    const p2 = parse(result) as any;
    assert.equal(p2.terminal?.shell, "bash");
    assert.equal(p2.theme?.name, "catppuccin");
    assert.equal(p2.theme?.auto_switch, false);
  });

  it("replaces existing name under [theme] section", () => {
    const existing = `[theme]\nname = "dracula"\nauto_switch = false\n\n[terminal]\nshell = "pwsh"`;
    const result = updateTomlTheme(existing, "rose-pine");
    const parsed = parse(result) as any;
    assert.equal(parsed.theme?.name, "rose-pine");
    assert.equal(parsed.theme?.auto_switch, false);
    assert.equal(parsed.terminal?.shell, "pwsh");
  });

  it("inserts name and disables auto_switch under existing [theme] section", () => {
    const existing = `[theme]\nauto_switch = true\n\n[terminal]\nshell = "pwsh"`;
    const result = updateTomlTheme(existing, "gruvbox");
    const parsed = parse(result) as any;
    assert.equal(parsed.theme?.name, "gruvbox");
    assert.equal(parsed.theme?.auto_switch, false);
    assert.equal(parsed.terminal?.shell, "pwsh");
  });

  it("handles [theme] section headers with comments and preserves inline comments", () => {
    const existing = `[theme] # User config\nname = "dracula" # default\nauto_switch = true # follower\n\n[ui]\nx = 24`;
    const result = updateTomlTheme(existing, "catppuccin-latte");
    const parsed = parse(result) as any;
    assert.equal(parsed.theme?.name, "catppuccin-latte");
    assert.equal(parsed.theme?.auto_switch, false);
    assert.equal(parsed.ui?.x, 24);
    assert.ok(result.includes('name = "catppuccin-latte" # default'));
    assert.ok(result.includes("auto_switch = false # follower"));
  });

  it("handles top-level dotted theme.name and theme.auto_switch keys", () => {
    const dotted = `theme.name = "nord"\ntheme.auto_switch = true\n\n[terminal]\nshell = "bash"`;
    const result = updateTomlTheme(dotted, "solarized-light");
    const parsed = parse(result) as any;
    assert.equal(parsed.theme?.name, "solarized-light");
    assert.equal(parsed.theme?.auto_switch, false);
    assert.equal(parsed.terminal?.shell, "bash");
    assert.ok(!result.includes("[theme]"), "no duplicate table");
  });

  it("preserves CRLF line endings when present", () => {
    const crlf = "[theme]\r\nname = \"dracula\"\r\n\r\n[terminal]\r\nshell = \"pwsh\"\r\n";
    const res = updateTomlTheme(crlf, "gruvbox");
    assert.ok(res.includes("\r\n"), "maintains CRLF");
    const parsed = parse(res) as any;
    assert.equal(parsed.theme?.name, "gruvbox");
    assert.equal(parsed.terminal?.shell, "pwsh");
  });

  it("terminates [theme] at array-of-tables and preserves keybinding name (regression: Repro A)", () => {
    const reproA = `[theme]\nauto_switch = false\n\n[[keys.command]]\nkey = "prefix+k"\nname = "keep-me"\n`;
    const res = updateTomlTheme(reproA, "nord");
    const parsed = parse(res) as any;
    assert.equal(parsed.theme?.name, "nord");
    assert.equal(parsed.theme?.auto_switch, false);
    assert.equal(parsed.keys?.command?.length, 1);
    assert.equal(parsed.keys?.command?.[0]?.key, "prefix+k");
    assert.equal(parsed.keys?.command?.[0]?.name, "keep-me");
  });

  it("inserts missing theme name inside [theme] before subsequent array-of-tables (regression: Repro B)", () => {
    const reproB = `[theme]\n\n[[keys.command]]\nkey = "prefix+k"\n`;
    const res = updateTomlTheme(reproB, "nord");
    const parsed = parse(res) as any;
    assert.equal(parsed.theme?.name, "nord");
    assert.equal(parsed.keys?.command?.length, 1);
    assert.equal(parsed.keys?.command?.[0]?.key, "prefix+k");
    assert.equal(parsed.keys?.command?.[0]?.name, undefined);
  });

  it("handles top-level dotted theme.* key without theme.name and avoids duplicate [theme] (regression: Repro C)", () => {
    const reproC = `theme.auto_switch = true\n[ui]\nx = 1\n`;
    const details = updateTomlThemeDetails(reproC, "nord");
    assert.equal(details.autoSwitchDisabled, true);
    const parsed = parse(details.content) as any;
    assert.equal(parsed.theme?.name, "nord");
    assert.equal(parsed.theme?.auto_switch, false);
    assert.equal(parsed.ui?.x, 1);
    assert.ok(!details.content.includes("[theme]"), "does not append duplicate [theme] table");
  });

  it("handles inline table theme = { ... } at top level", () => {
    const inline = `theme = { auto_switch = true }\n[terminal]\nshell = "bash"\n`;
    const details = updateTomlThemeDetails(inline, "nord");
    assert.equal(details.autoSwitchDisabled, true);
    const parsed = parse(details.content) as any;
    assert.equal(parsed.theme?.name, "nord");
    assert.equal(parsed.theme?.auto_switch, false);
    assert.equal(parsed.terminal?.shell, "bash");
    assert.ok(!details.content.includes("[theme]"));
  });

  it("golden test: updates real user config shape line-by-line and preserves CRLF", () => {
    const lines = [
      'onboarding = true',
      'agent_panel_sort = "alpha"',
      '',
      '[update]',
      'check_on_startup = true',
      '',
      '[ui.toast]',
      'duration_ms = 3000',
      '',
      '[ui]',
      'sidebar_width = 24',
      '',
      '[theme]',
      'name = "old-theme"',
      'auto_switch = false',
      '',
      '[[keys.command]]',
      'key = "prefix+1"',
      'action = "focus_pane_1"',
      '',
      '[[keys.command]]',
      'key = "prefix+2"',
      'action = "focus_pane_2"',
      '',
      '[[keys.command]]',
      'key = "prefix+c"',
      'action = "new_tab"',
      '',
      '[[keys.command]]',
      'key = "prefix+x"',
      'action = "close_pane"',
      '',
      '[[keys.command]]',
      'key = "prefix+k"',
      'name = "custom-kill"',
      'action = "kill_pane"',
      '',
    ];
    const goldenConfig = lines.join("\r\n");
    const updated = updateTomlTheme(goldenConfig, "solarized-light");

    assert.ok(updated.includes("\r\n"), "line endings must stay CRLF");
    const originalLines = goldenConfig.split("\r\n");
    const updatedLines = updated.split("\r\n");
    assert.equal(updatedLines.length, originalLines.length, "line count unchanged");

    let changedLineCount = 0;
    for (let i = 0; i < originalLines.length; i++) {
      if (originalLines[i] !== updatedLines[i]) {
        changedLineCount++;
        assert.equal(originalLines[i], 'name = "old-theme"');
        assert.equal(updatedLines[i], 'name = "solarized-light"');
      }
    }
    assert.equal(changedLineCount, 1, "exactly one line modified");

    const parsed = parse(updated) as any;
    assert.equal(parsed.onboarding, true);
    assert.equal(parsed.agent_panel_sort, "alpha");
    assert.equal(parsed.update?.check_on_startup, true);
    assert.equal(parsed.ui?.toast?.duration_ms, 3000);
    assert.equal(parsed.ui?.sidebar_width, 24);
    assert.equal(parsed.theme?.name, "solarized-light");
    assert.equal(parsed.theme?.auto_switch, false);
    assert.equal(parsed.keys?.command?.length, 5);
    assert.equal(parsed.keys?.command?.[4]?.name, "custom-kill");
    assert.equal(parsed.keys?.command?.[4]?.action, "kill_pane");
  });

  it("idempotency: update(update(x)) === update(x) across diverse fixtures", () => {
    const fixtures = [
      "",
      "[terminal]\nshell = \"bash\"\n",
      "[theme]\nname = \"dracula\"\nauto_switch = false\n",
      "[theme]\nauto_switch = true\n",
      "[theme] # comment\nname = \"dracula\" # mine\nauto_switch = true # auto\n",
      "theme.name = \"nord\"\ntheme.auto_switch = true\n",
      "theme.auto_switch = true\n[ui]\nx = 1\n",
      "theme = { auto_switch = true }\n[terminal]\nshell = \"bash\"\n",
      "[theme]\nauto_switch = false\n\n[[keys.command]]\nkey = \"prefix+k\"\nname = \"keep-me\"\n",
      "[theme]\n\n[[keys.command]]\nkey = \"prefix+k\"\n",
    ];

    for (const f of fixtures) {
      const once = updateTomlTheme(f, "nord");
      const twice = updateTomlTheme(once, "nord");
      assert.equal(twice, once, `idempotent on: ${JSON.stringify(f)}`);

      const changedOnce = updateTomlTheme(once, "gruvbox");
      const changedTwice = updateTomlTheme(changedOnce, "gruvbox");
      assert.equal(changedTwice, changedOnce, `idempotent re-switch on: ${JSON.stringify(f)}`);
    }
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

      const parsed = parse(readFileSync(configPath, "utf8")) as any;
      assert.equal(parsed.theme?.name, "solarized-light");

      const res2 = syncHerdrTheme("solarized-light", { configPath, reloadServer: false });
      assert.equal(res2.updated, false);
      assert.equal(res2.autoSwitchDisabled, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("preserves existing content and reports autoSwitchDisabled when auto_switch is true", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-herdr-test-"));
    const configPath = join(dir, "config.toml");
    try {
      const initial = `[terminal]\nshell = "pwsh"\n\n[theme]\nname = "dracula"\nauto_switch = true\n`;
      writeFileSync(configPath, initial, "utf8");

      const res = syncHerdrTheme("gruvbox", { configPath, reloadServer: false });
      assert.equal(res.updated, true);
      assert.equal(res.autoSwitchDisabled, true);

      const parsed = parse(readFileSync(configPath, "utf8")) as any;
      assert.equal(parsed.terminal?.shell, "pwsh");
      assert.equal(parsed.theme?.name, "gruvbox");
      assert.equal(parsed.theme?.auto_switch, false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("error path: returns error object when configPath is a directory and does not throw", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-herdr-test-"));
    try {
      const res = syncHerdrTheme("nord", { configPath: dir, reloadServer: false });
      assert.equal(res.updated, false);
      assert.equal(res.herdrTheme, "nord");
      assert.ok(typeof res.error === "string" && res.error.length > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
