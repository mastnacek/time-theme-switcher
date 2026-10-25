/**
 * Switcher controller tests: enable/disable lifecycle with a fake UI context.
 * Verifies slot application, de-duplication between polls and the restore of
 * the pre-rotation theme when rotation is switched off.
 */

import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import { createController } from "../src/slices/switcher/controller.ts";

interface FakeTheme {
  name: string;
}

interface FakeUi {
  theme: FakeTheme;
  setThemeCalls: unknown[];
  notifications: string[];
  setTheme(theme: unknown): { success: boolean };
  notify(message: string, level?: string): void;
}

function makeUi(current: FakeTheme): FakeUi {
  return {
    theme: current,
    setThemeCalls: [],
    notifications: [],
    setTheme(theme) {
      this.setThemeCalls.push(theme);
      return { success: true };
    },
    notify(message) {
      this.notifications.push(message);
    },
  };
}

function makeDeps(initialSettings: Record<string, unknown>, slot: () => string) {
  let settings = {
    enabled: true,
    latitude: 50.0755,
    longitude: 14.4378,
    timezone: "Europe/Prague",
    lang: "en",
    ...initialSettings,
  };
  return {
    deps: {
      getSettings: () => ({ ...settings }),
      saveSettings: (update: Record<string, unknown>) => {
        settings = { ...settings, ...update };
        return { ...settings };
      },
      getSlotForTime: () => slot(),
      themeNames: { day: "day", night: "osaka-jade" } as Record<string, string>,
      themeLabels: { day: "Day (Solarized Light)", night: "Osaka Jade" } as Record<
        string,
        string
      >,
    },
    current: () => settings,
  };
}

describe("switcher controller", () => {
  it("applies the current slot on session_start when enabled", () => {
    const { deps } = makeDeps({ enabled: true }, () => "day");
    const controller = createController(deps);
    const ui = makeUi({ name: "gruvbox" });
    controller.handleSessionStart({ hasUI: true, ui } as never);
    assert.deepEqual(ui.setThemeCalls, ["day"]);
    assert.equal(ui.notifications.length, 1);
    controller.handleShutdown();
  });

  it("does nothing on session_start when disabled", () => {
    const { deps } = makeDeps({ enabled: false }, () => "day");
    const controller = createController(deps);
    const ui = makeUi({ name: "gruvbox" });
    controller.handleSessionStart({ hasUI: true, ui } as never);
    assert.deepEqual(ui.setThemeCalls, []);
    controller.handleShutdown();
  });

  it("restores the pre-rotation theme when switched off", () => {
    const { deps } = makeDeps({ enabled: true }, () => "day");
    const controller = createController(deps);
    const ui = makeUi({ name: "gruvbox" });
    const ctx = { hasUI: true, ui } as never;
    controller.handleSessionStart(ctx);
    controller.setEnabled(false, ctx);
    assert.equal(controller.getSettings().enabled, false);
    assert.deepEqual(ui.setThemeCalls, ["day", { name: "gruvbox" }]);
    assert.ok(
      ui.notifications.some((n) => n.includes("gruvbox")),
      "restore notification mentions the restored theme",
    );
    controller.handleShutdown();
  });

  it("re-applies the slot when switched back on", () => {
    const { deps } = makeDeps({ enabled: true }, () => "day");
    const controller = createController(deps);
    const ui = makeUi({ name: "gruvbox" });
    const ctx = { hasUI: true, ui } as never;
    controller.handleSessionStart(ctx);
    controller.setEnabled(false, ctx);
    controller.setEnabled(true, ctx);
    assert.equal(controller.getSettings().enabled, true);
    assert.deepEqual(ui.setThemeCalls, ["day", { name: "gruvbox" }, "day"]);
    controller.handleShutdown();
  });

  it("does not re-apply an unchanged slot on poll, applies a changed one", () => {
    mock.timers.enable({ apis: ["setInterval"] });
    try {
      let slot = "day";
      const { deps } = makeDeps({ enabled: true }, () => slot);
      const controller = createController(deps);
      const ui = makeUi({ name: "gruvbox" });
      controller.handleSessionStart({ hasUI: true, ui } as never);
      mock.timers.tick(60_000);
      assert.deepEqual(ui.setThemeCalls, ["day"], "unchanged slot must not re-apply");
      slot = "night";
      mock.timers.tick(60_000);
      assert.deepEqual(ui.setThemeCalls, ["day", "osaka-jade"]);
      controller.handleShutdown();
    } finally {
      mock.timers.reset();
    }
  });

  it("savePrefs merges coordinate updates into the live settings", () => {
    const { deps, current } = makeDeps({ enabled: true }, () => "day");
    const controller = createController(deps);
    controller.savePrefs({ latitude: 49.2 });
    assert.equal(controller.getSettings().latitude, 49.2);
    assert.equal(current().latitude, 49.2, "update must be persisted via saveSettings");
    assert.equal(controller.getSettings().longitude, 14.4378);
  });

  it("reports the current slot label", () => {
    const { deps } = makeDeps({ enabled: true }, () => "night");
    const controller = createController(deps);
    assert.equal(controller.currentSlotLabel(), "Osaka Jade");
  });
});
