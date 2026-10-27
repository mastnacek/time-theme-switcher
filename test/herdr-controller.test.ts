/**
 * Herdr controller integration tests: verifies that the switcher controller
 * passes resolved Herdr theme names to deps.syncHerdr and notifies on auto_switch disablement.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createController, type SwitcherDeps } from "../src/slices/switcher/controller.ts";
import type { SyncHerdrOptions, SyncHerdrResult } from "../src/slices/switcher/herdr.ts";

interface FakeUi {
  theme: { name: string; appearance?: "dark" | "light" };
  setThemeCalls: string[];
  notifications: string[];
  setTheme(theme: unknown): { success: boolean };
  notify(message: string, level?: string): void;
}

function makeUi(appearance: "dark" | "light" = "dark"): FakeUi {
  return {
    theme: { name: "default-theme", appearance },
    setThemeCalls: [],
    notifications: [],
    setTheme(theme) {
      this.setThemeCalls.push(typeof theme === "string" ? theme : (theme as any).name);
      return { success: true };
    },
    notify(message) {
      this.notifications.push(message);
    },
  };
}

function makeDeps(
  initialSettings: Record<string, unknown>,
  slot: () => string,
  syncHerdrFn: (theme: string, options?: SyncHerdrOptions) => SyncHerdrResult,
) {
  let settings = {
    enabled: true,
    latitude: 50.0755,
    longitude: 14.4378,
    timezone: "Europe/Prague",
    lang: "en",
    themes: { dawn: "tts-dawn", day: "tts-day", dusk: "tts-dusk", night: "tts-osaka-jade" },
    syncTerminalBg: false,
    syncTerminalFg: false,
    syncHerdrTheme: true,
    ...initialSettings,
  };
  const deps: SwitcherDeps<string> = {
    getSettings: () => ({ ...settings }),
    saveSettings: (update) => {
      settings = { ...settings, ...update };
      return { ...settings };
    },
    getSlotForTime: () => slot(),
    themeNames: { day: "tts-day", night: "tts-osaka-jade" },
    themeLabels: { day: "Day", night: "Night" },
    syncHerdr: syncHerdrFn,
  };
  return deps;
}

describe("controller Herdr synchronization integration", () => {
  it("passes the correct resolved herdrTheme to syncHerdr on session_start and slot transition", () => {
    const syncCalls: string[] = [];
    let currentSlot = "day";
    const deps = makeDeps({ enabled: true, syncHerdrTheme: true }, () => currentSlot, (theme) => {
      syncCalls.push(theme);
      return { updated: true, herdrTheme: theme, autoSwitchDisabled: false };
    });

    const controller = createController(deps);
    const ui = makeUi("light");
    const ctx = { hasUI: true, ui } as never;

    controller.handleSessionStart(ctx);
    // tts-day -> solarized-light
    assert.deepEqual(syncCalls, ["solarized-light"]);

    // Transition to night
    currentSlot = "night";
    // savePrefs triggers re-evaluation if slot assignment changed, or refresh
    const refreshRes = controller.refresh(ui as never);
    assert.equal(refreshRes.herdrTheme, "rose-pine");
    assert.deepEqual(syncCalls, ["solarized-light", "rose-pine"]);

    controller.handleShutdown();
  });

  it("notifies herdrAutoSwitchDisabled only once per session even across multiple slot changes", () => {
    let currentSlot = "day";
    const deps = makeDeps({ enabled: true, syncHerdrTheme: true }, () => currentSlot, (theme) => {
      // Simulate disabling auto_switch on each call
      return { updated: true, herdrTheme: theme, autoSwitchDisabled: true };
    });

    const controller = createController(deps);
    const ui = makeUi("light");
    const ctx = { hasUI: true, ui } as never;

    controller.handleSessionStart(ctx);
    // ui should have received the notification about Herdr auto_switch being disabled
    const autoSwitchNotifsFirst = ui.notifications.filter((n) =>
      n.toLowerCase().includes("auto_switch") || n.toLowerCase().includes("herdr"),
    );
    assert.equal(autoSwitchNotifsFirst.length, 1, "notified on first disablement");

    // Change slot to night
    currentSlot = "night";
    controller.savePrefs({
      themes: {
        dawn: "tts-dawn",
        day: "tts-day",
        dusk: "tts-dusk",
        night: "tts-night",
      },
    });

    // Ensure the auto_switch disable notification was NOT sent a second time
    const autoSwitchNotifsSecond = ui.notifications.filter((n) =>
      n.toLowerCase().includes("auto_switch") || n.toLowerCase().includes("herdr"),
    );
    assert.equal(autoSwitchNotifsSecond.length, 1, "does not notify again in same session");

    controller.handleShutdown();
  });

  it("does not invoke syncHerdr when syncHerdrTheme is false", () => {
    let called = false;
    const deps = makeDeps({ enabled: true, syncHerdrTheme: false }, () => "day", (theme) => {
      called = true;
      return { updated: true, herdrTheme: theme };
    });

    const controller = createController(deps);
    const ui = makeUi("light");
    controller.handleSessionStart({ hasUI: true, ui } as never);

    assert.equal(called, false);
    controller.handleShutdown();
  });

  it("passes active theme background as sidebarBg option to syncHerdr", () => {
    const syncCalls: { theme: string; sidebarBg?: string }[] = [];
    const deps = makeDeps({ enabled: true, syncHerdrTheme: true }, () => "day", (theme, options) => {
      syncCalls.push({ theme, sidebarBg: options?.sidebarBg });
      return { updated: true, herdrTheme: theme };
    });

    const controller = createController(deps);
    const ui = makeUi("light");
    controller.handleSessionStart({ hasUI: true, ui } as never);

    assert.equal(syncCalls.length, 1);
    assert.equal(syncCalls[0].theme, "solarized-light");
    assert.equal(syncCalls[0].sidebarBg, "#fdf6e3");

    controller.handleShutdown();
  });
});
