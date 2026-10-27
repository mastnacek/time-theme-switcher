/** Herdr multiplexer theme synchronization tests: slot mapping, env detection, binary resolution, and sync behavior. */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { parse } from "smol-toml";
import {
  defaultHerdrConfigPath,
  isHerdr,
  resolveHerdrBin,
  resolveHerdrTheme,
  syncHerdrTheme,
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

describe("isHerdr", () => {
  it("detects HERDR_ENV=1", () => {
    assert.equal(isHerdr({ HERDR_ENV: "1" }), true);
  });

  it("detects TERM_PROGRAM=herdr (case-insensitive)", () => {
    assert.equal(isHerdr({ TERM_PROGRAM: "herdr" }), true);
    assert.equal(isHerdr({ TERM_PROGRAM: "Herdr" }), true);
  });

  it("returns false when neither is set or empty", () => {
    assert.equal(isHerdr({}), false);
    assert.equal(isHerdr({ HERDR_ENV: "0", TERM_PROGRAM: "xterm" }), false);
    assert.equal(isHerdr({ HERDR_ENV: "" }), false);
  });
});

describe("resolveHerdrBin", () => {
  it("uses HERDR_BIN_PATH when set", () => {
    const binPath = "C:\\Tools\\herdr.exe";
    assert.equal(resolveHerdrBin({ HERDR_BIN_PATH: binPath }), binPath);
  });

  it("falls back to 'herdr' when HERDR_BIN_PATH is not set or empty", () => {
    assert.equal(resolveHerdrBin({}), "herdr");
    assert.equal(resolveHerdrBin({ HERDR_BIN_PATH: "" }), "herdr");
    assert.equal(resolveHerdrBin({ HERDR_BIN_PATH: "   " }), "herdr");
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
    assert.equal(resolveHerdrTheme("night", "gruvbox-dawn-dark"), "gruvbox");
    assert.equal(resolveHerdrTheme("day", "gruvbox-dawn-dark"), "gruvbox");
    assert.equal(resolveHerdrTheme("night", "gruvbox-dawn"), "gruvbox-light");
  });
});

describe("syncHerdrTheme", () => {
  it("writes theme and sidebar_bg to config file", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-herdr-test-"));
    const configPath = join(dir, "config.toml");
    try {
      // Inside Herdr a missing config is created; pinned so the result does
      // not depend on whether the tests themselves run inside Herdr.
      const env = { HERDR_ENV: "1" };
      const res = syncHerdrTheme("solarized-light", {
        configPath,
        sidebarBg: "#fdf6e3",
        reloadServer: false,
        env,
      });
      assert.equal(res.updated, true);
      assert.equal(res.herdrTheme, "solarized-light");

      const parsed = parse(readFileSync(configPath, "utf8")) as any;
      assert.equal(parsed.theme?.name, "solarized-light");
      assert.equal(parsed.theme?.custom?.sidebar_bg, "#fdf6e3");
      assert.deepEqual(
        readdirSync(dir).filter((f) => f.endsWith(".tmp")),
        [],
        "atomic write leaves no temp file behind",
      );

      const res2 = syncHerdrTheme("solarized-light", {
        configPath,
        sidebarBg: "#fdf6e3",
        reloadServer: false,
        env,
      });
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

      const res = syncHerdrTheme("gruvbox", {
        configPath,
        sidebarBg: "#282828",
        reloadServer: false,
      });
      assert.equal(res.updated, true);
      assert.equal(res.autoSwitchDisabled, true);

      const parsed = parse(readFileSync(configPath, "utf8")) as any;
      assert.equal(parsed.terminal?.shell, "pwsh");
      assert.equal(parsed.theme?.name, "gruvbox");
      assert.equal(parsed.theme?.auto_switch, false);
      assert.equal(parsed.theme?.custom?.sidebar_bg, "#282828");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("invokes reload-config using HERDR_BIN_PATH when isHerdr is true", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-herdr-test-"));
    const configPath = join(dir, "config.toml");
    const executedCommands: { bin: string; args: string[] }[] = [];
    try {
      const env = {
        HERDR_ENV: "1",
        HERDR_BIN_PATH: "/custom/bin/herdr",
      };
      const mockExecFile = ((bin: string, args: string[]) => {
        executedCommands.push({ bin, args });
        return { unref() {} };
      }) as any;

      const res = syncHerdrTheme("nord", {
        configPath,
        env,
        execFileFn: mockExecFile,
      });
      assert.equal(res.updated, true);
      assert.equal(executedCommands.length, 1);
      assert.equal(executedCommands[0].bin, "/custom/bin/herdr");
      assert.deepEqual(executedCommands[0].args, ["server", "reload-config"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips everything when there is no Herdr: no config, not inside Herdr", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-herdr-test-"));
    const configPath = join(dir, "config.toml");
    const executedCommands: any[] = [];
    try {
      const mockExecFile = ((bin: string, args: string[]) => {
        executedCommands.push({ bin, args });
        return { unref() {} };
      }) as any;

      const res = syncHerdrTheme("nord", { configPath, env: {}, execFileFn: mockExecFile });
      assert.equal(res.skipped, true);
      assert.equal(res.updated, false);
      assert.equal(existsSync(configPath), false, "must not create a Herdr config");
      assert.equal(executedCommands.length, 0, "must not spawn a missing herdr binary");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reloads server when Herdr is installed but pi runs outside it", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-herdr-test-"));
    const configPath = join(dir, "config.toml");
    const executedCommands: any[] = [];
    try {
      writeFileSync(configPath, `[theme]\nname = "dracula"\n`, "utf8");
      const env = {};
      const mockExecFile = ((bin: string, args: string[]) => {
        executedCommands.push({ bin, args });
        return { unref() {} };
      }) as any;

      const res = syncHerdrTheme("nord", {
        configPath,
        env,
        execFileFn: mockExecFile,
      });
      assert.equal(res.updated, true);
      assert.equal(executedCommands.length, 1, "must reload server even if not under Herdr");
      assert.equal(executedCommands[0].bin, "herdr");
      assert.deepEqual(executedCommands[0].args, ["server", "reload-config"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("skips reload-config when reloadServer option is explicitly false", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-herdr-test-"));
    const configPath = join(dir, "config.toml");
    const executedCommands: any[] = [];
    try {
      const env = { HERDR_ENV: "1" };
      const mockExecFile = ((bin: string, args: string[]) => {
        executedCommands.push({ bin, args });
        return { unref() {} };
      }) as any;

      const res = syncHerdrTheme("nord", {
        configPath,
        env,
        reloadServer: false,
        execFileFn: mockExecFile,
      });
      assert.equal(res.updated, true);
      assert.equal(executedCommands.length, 0, "must not reload if reloadServer is false");
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
