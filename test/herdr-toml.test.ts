/** Herdr TOML parser and modification tests: structural validation via smol-toml, golden tests, idempotency. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse } from "smol-toml";
import {
  updateTomlTheme,
  updateTomlThemeDetails,
} from "../src/slices/switcher/herdr-toml.ts";

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

  it("handles '#' inside basic and literal strings without corrupting into fake comments (regression)", () => {
    const basicNoComment = `[theme]\nname = "my#theme"\n`;
    const res1 = updateTomlTheme(basicNoComment, "nord");
    assert.equal((parse(res1) as any).theme?.name, "nord");
    assert.ok(res1.includes('name = "nord"\n'));

    const basicWithComment = `[theme]\nname = "my#theme" # real comment\n`;
    const res2 = updateTomlTheme(basicWithComment, "nord");
    assert.equal((parse(res2) as any).theme?.name, "nord");
    assert.ok(res2.includes('name = "nord" # real comment\n'));

    const literalNoComment = `[theme]\nname = 'my#literal#theme'\n`;
    const res3 = updateTomlTheme(literalNoComment, "nord");
    assert.equal((parse(res3) as any).theme?.name, "nord");
    assert.ok(res3.includes('name = "nord"\n'));

    const literalWithComment = `[theme]\nname = 'my#literal#theme' # literal comment\n`;
    const res4 = updateTomlTheme(literalWithComment, "nord");
    assert.equal((parse(res4) as any).theme?.name, "nord");
    assert.ok(res4.includes('name = "nord" # literal comment\n'));
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

  it("creates [theme.custom] with sidebar_bg when sidebarBg is supplied", () => {
    const toml = `[theme]\nname = "nord"\nauto_switch = false\n\n[[keys.command]]\nkey = "prefix+k"\n`;
    const res = updateTomlTheme(toml, "solarized-light", "#fdf6e3");
    const parsed = parse(res) as any;
    assert.equal(parsed.theme?.name, "solarized-light");
    assert.equal(parsed.theme?.custom?.sidebar_bg, "#fdf6e3");
    assert.equal(parsed.keys?.command?.[0]?.key, "prefix+k");
  });

  it("updates existing [theme.custom] sidebar_bg without breaking other keys in theme.custom", () => {
    const toml = `[theme]\nname = "nord"\n\n[theme.custom]\naccent = "#ff0000"\nsidebar_bg = "#2e3440" # old\nsidebar_fg = "#eceff4"\n\n[ui]\nx = 1\n`;
    const res = updateTomlTheme(toml, "solarized-light", "#fdf6e3");
    const parsed = parse(res) as any;
    assert.equal(parsed.theme?.name, "solarized-light");
    assert.equal(parsed.theme?.custom?.sidebar_bg, "#fdf6e3");
    assert.equal(parsed.theme?.custom?.accent, "#ff0000");
    assert.equal(parsed.theme?.custom?.sidebar_fg, "#eceff4");
    assert.equal(parsed.ui?.x, 1);
    assert.ok(res.includes('sidebar_bg = "#fdf6e3" # old'));
  });

  it("inserts sidebar_bg into existing [theme.custom] when sidebar_bg was omitted", () => {
    const toml = `[theme]\nname = "nord"\n\n[theme.custom]\naccent = "#ff0000"\n`;
    const res = updateTomlTheme(toml, "rose-pine", "#12061a");
    const parsed = parse(res) as any;
    assert.equal(parsed.theme?.name, "rose-pine");
    assert.equal(parsed.theme?.custom?.accent, "#ff0000");
    assert.equal(parsed.theme?.custom?.sidebar_bg, "#12061a");
  });

  it("updates dotted theme.custom.sidebar_bg at top level", () => {
    const toml = `theme.name = "nord"\ntheme.custom.sidebar_bg = "#old"\n[ui]\nx = 1\n`;
    const res = updateTomlTheme(toml, "solarized-light", "#fdf6e3");
    const parsed = parse(res) as any;
    assert.equal(parsed.theme?.name, "solarized-light");
    assert.equal(parsed.theme?.custom?.sidebar_bg, "#fdf6e3");
    assert.equal(parsed.ui?.x, 1);
    assert.ok(!res.includes("[theme.custom]"));
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
      "[theme]\nname = \"nord\"\n\n[theme.custom]\nsidebar_bg = \"#111\"\nsidebar_fg = \"#fff\"\n",
    ];

    for (const f of fixtures) {
      const once = updateTomlTheme(f, "nord", "#2e3440");
      const twice = updateTomlTheme(once, "nord", "#2e3440");
      assert.equal(twice, once, `idempotent on: ${JSON.stringify(f)}`);

      const changedOnce = updateTomlTheme(once, "gruvbox", "#282828");
      const changedTwice = updateTomlTheme(changedOnce, "gruvbox", "#282828");
      assert.equal(changedTwice, changedOnce, `idempotent re-switch on: ${JSON.stringify(f)}`);
    }
  });
});
