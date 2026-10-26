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
      // Controller passes either a name (registered theme) or an in-memory
      // Theme instance (bundled palette); record the identity either way.
      this.setThemeCalls.push(
        typeof theme === "string" ? theme : (theme as { name?: string }).name,
      );
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
    themes: { dawn: "tts-dawn", day: "tts-day", dusk: "tts-dusk", night: "tts-osaka-jade" },
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
      themeNames: { day: "tts-day", night: "tts-osaka-jade" } as Record<string, string>,
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
    assert.deepEqual(ui.setThemeCalls, ["tts-day"]);
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
    assert.deepEqual(ui.setThemeCalls, ["tts-day", "gruvbox"]);
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
    assert.deepEqual(ui.setThemeCalls, ["tts-day", "gruvbox", "tts-day"]);
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
      assert.deepEqual(ui.setThemeCalls, ["tts-day"], "unchanged slot must not re-apply");
      slot = "night";
      mock.timers.tick(60_000);
      assert.deepEqual(ui.setThemeCalls, ["tts-day", "tts-osaka-jade"]);
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

  it("applies the theme assigned to the slot instead of the default", () => {
    const { deps } = makeDeps(
      {
        enabled: true,
        themes: { dawn: "tts-dawn", day: "dracula", dusk: "tts-dusk", night: "tts-osaka-jade" },
      },
      () => "day",
    );
    const controller = createController(deps);
    const ui = makeUi({ name: "gruvbox" });
    controller.handleSessionStart({ hasUI: true, ui } as never);
    assert.deepEqual(ui.setThemeCalls, ["dracula"]);
    controller.handleShutdown();
  });

  it("re-applies immediately when the active slot's assignment changes", () => {
    const { deps, current } = makeDeps({ enabled: true }, () => "day");
    const controller = createController(deps);
    const ui = makeUi({ name: "gruvbox" });
    controller.handleSessionStart({ hasUI: true, ui } as never);
    controller.savePrefs({ themes: { ...current().themes, day: "gruvbox-dark" } });
    assert.deepEqual(ui.setThemeCalls, ["tts-day", "gruvbox-dark"]);
    controller.handleShutdown();
  });

  it("does not re-apply when an unrelated preference changes", () => {
    const { deps } = makeDeps({ enabled: true }, () => "day");
    const controller = createController(deps);
    const ui = makeUi({ name: "gruvbox" });
    controller.handleSessionStart({ hasUI: true, ui } as never);
    controller.savePrefs({ latitude: 49 });
    assert.deepEqual(ui.setThemeCalls, ["tts-day"]);
    controller.handleShutdown();
  });

  it("notifies an error when the assigned theme cannot be applied", () => {
    const { deps } = makeDeps({ enabled: true }, () => "day");
    const controller = createController(deps);
    const ui = makeUi({ name: "gruvbox" });
    ui.setTheme = function (theme) {
      this.setThemeCalls.push(
        typeof theme === "string" ? theme : (theme as { name?: string }).name,
      );
      return { success: false };
    };
    controller.handleSessionStart({ hasUI: true, ui } as never);
    assert.ok(
      ui.notifications.some((n) => n.includes('"tts-day"')),
      "failure notification names the theme that could not be applied",
    );
    controller.handleShutdown();
  });
});
