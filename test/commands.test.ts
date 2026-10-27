/**
 * Commands and refresh tests: /theme-switcher and /tts slash commands,
 * completions with trailing-space contract, and forced environment refresh.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerCommands } from "../src/slices/switcher/commands.ts";
import { createController } from "../src/slices/switcher/controller.ts";

interface FakeUi {
  theme: { name: string };
  setThemeCalls: string[];
  notifications: string[];
  setTheme(theme: unknown): { success: boolean };
  notify(message: string, level?: string): void;
}

function makeUi(initialName = "gruvbox"): FakeUi {
  return {
    theme: { name: initialName },
    setThemeCalls: [],
    notifications: [],
    setTheme(theme) {
      this.setThemeCalls.push(
        typeof theme === "string" ? theme : (theme as { name?: string }).name ?? "custom",
      );
      return { success: true };
    },
    notify(message) {
      this.notifications.push(message);
    },
  };
}

function makeDeps(initialSettings: Record<string, unknown> = {}, slot = "day") {
  let settings = {
    enabled: true,
    latitude: 50.0755,
    longitude: 14.4378,
    timezone: "Europe/Prague",
    lang: "en",
    themes: { dawn: "tts-dawn", day: "tts-day", dusk: "tts-dusk", night: "tts-osaka-jade" },
    syncTerminalBg: false,
    syncTerminalFg: false,
    syncHerdrTheme: false,
    hold: null as { slot: "dawn" | "day" | "dusk" | "night"; until: string } | null,
    ...initialSettings,
  };
  const nullStream = { isTTY: false, write: () => true };
  return {
    deps: {
      getSettings: () => ({ ...settings }),
      saveSettings: (update: Record<string, unknown>) => {
        settings = { ...settings, ...update };
        return { ...settings };
      },
      getSlotForTime: () => slot,
      themeNames: { day: "tts-day", night: "tts-osaka-jade" } as Record<string, string>,
      themeLabels: { day: "Day (Solarized Light)", night: "Osaka Jade" } as Record<
        string,
        string
      >,
      terminalStream: nullStream as { isTTY?: boolean; write(data: string): unknown } | undefined,
    },
    current: () => settings,
  };
}

describe("commands & refresh", () => {
  it("registers both theme-switcher and tts aliases", () => {
    const { deps } = makeDeps();
    const controller = createController(deps);
    const registered: Record<string, { description: string; getArgumentCompletions: unknown; handler: unknown }> = {};
    const fakePi = {
      registerCommand(name: string, def: typeof registered[string]) {
        registered[name] = def;
      },
    };

    registerCommands(fakePi as never, controller);
    assert.ok(registered["theme-switcher"], "registers theme-switcher command");
    assert.ok(registered["tts"], "registers tts shortcut command");
    assert.equal(registered["theme-switcher"].description, registered["tts"].description);
  });

  it("provides completions adhering to trailing-space contract", () => {
    const { deps } = makeDeps();
    const controller = createController(deps);
    const registered: Record<string, { getArgumentCompletions: (p: string) => Array<{ value: string; label: string }> | null }> = {};
    const fakePi = {
      registerCommand(name: string, def: typeof registered[string]) {
        registered[name] = def;
      },
    };

    registerCommands(fakePi as never, controller);
    const complete = registered["tts"].getArgumentCompletions;

    const rootItems = complete("");
    assert.ok(rootItems, "returns root completions");

    // Terminal choices must not have trailing space
    const refreshItem = rootItems.find((i) => i.label === "refresh");
    assert.ok(refreshItem);
    assert.equal(refreshItem.value, "refresh");

    const statusItem = rootItems.find((i) => i.label === "status");
    assert.ok(statusItem);
    assert.equal(statusItem.value, "status");

    // Non-terminal choices must have trailing space
    const langItem = rootItems.find((i) => i.label === "lang");
    assert.ok(langItem);
    assert.equal(langItem.value, "lang ");

    // Subcommand completion for lang
    const langSubItems = complete("lang ");
    assert.ok(langSubItems);
    assert.ok(langSubItems.some((i) => i.value === "lang en"));
    assert.ok(langSubItems.some((i) => i.value === "lang cs"));
  });

  it("refresh forces immediate re-application and emits OSC sequences", () => {
    let output = "";
    const mockStream = {
      isTTY: true,
      write: (data: string) => {
        output += data;
        return true;
      },
    };
    const { deps } = makeDeps(
      { enabled: true, syncTerminalBg: true, syncTerminalFg: true, syncHerdrTheme: false },
      "day",
    );
    deps.terminalStream = mockStream;
    const controller = createController(deps);
    const ui = makeUi("gruvbox");
    const ctx = { hasUI: true, ui } as never;

    controller.handleSessionStart(ctx);
    assert.deepEqual(ui.setThemeCalls, ["tts-day"]);
    assert.ok(output.includes("\x1b]11;#fdf6e3\x07"));
    assert.ok(output.includes("\x1b]10;#586e75\x07"));

    output = "";
    const res = controller.refresh(ui as never);
    assert.equal(res.success, true);
    assert.equal(res.slot, "day");
    assert.equal(res.theme, "tts-day");
    // Forced re-apply despite slot being unchanged
    assert.deepEqual(ui.setThemeCalls, ["tts-day", "tts-day"]);
    assert.ok(output.includes("\x1b]11;#fdf6e3\x07"));
    assert.ok(output.includes("\x1b]10;#586e75\x07"));
    controller.handleShutdown();
  });

  it("handles refresh and apply subcommands via command handler", async () => {
    const { deps } = makeDeps();
    const controller = createController(deps);
    const registered: Record<string, { handler: (args: string, ctx: unknown) => Promise<void> }> = {};
    const fakePi = {
      registerCommand(name: string, def: typeof registered[string]) {
        registered[name] = def;
      },
    };

    registerCommands(fakePi as never, controller);
    const ui = makeUi("gruvbox");
    const ctx = { hasUI: true, ui, mode: "tui" };

    controller.handleSessionStart(ctx as never);
    ui.notifications = [];

    await registered["tts"].handler("refresh", ctx);
    assert.ok(
      ui.notifications.some((n) => n.toLowerCase().includes("refreshed") || n.toLowerCase().includes("obnoven")),
      "notifies user about refreshed theme",
    );

    ui.notifications = [];
    await registered["theme-switcher"].handler("apply", ctx);
    assert.ok(
      ui.notifications.some((n) => n.toLowerCase().includes("refreshed") || n.toLowerCase().includes("obnoven")),
      "apply alias also refreshes theme",
    );

    controller.handleShutdown();
  });
});
