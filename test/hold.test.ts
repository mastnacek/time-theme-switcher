/**
 * Manual hold tests (/tts hold): the sun cannot see the room lights, so the
 * operator can pin a slot until the next solar change or for a duration.
 * Covers duration parsing, override and release, expiry, refusals,
 * completions and the persisted settings shape.
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { createSettingsStore } from "../src/slices/settings/index.ts";
import { parseDuration, registerCommands } from "../src/slices/switcher/commands.ts";
import { createController } from "../src/slices/switcher/controller.ts";

type HoldSetting = { slot: "dawn" | "day" | "dusk" | "night"; until: string } | null;

function makeUi() {
  return {
    theme: { name: "gruvbox" },
    setThemeCalls: [] as string[],
    notifications: [] as string[],
    setTheme(theme: unknown) {
      this.setThemeCalls.push(
        typeof theme === "string" ? theme : (theme as { name?: string }).name ?? "custom",
      );
      return { success: true };
    },
    notify(message: string) {
      this.notifications.push(message);
    },
  };
}

function setup(options: { slotAt?: (date: Date) => string; hold?: HoldSetting; enabled?: boolean } = {}) {
  let settings = {
    enabled: options.enabled ?? true,
    latitude: 50.0755,
    longitude: 14.4378,
    timezone: "Europe/Prague",
    lang: "en",
    themes: { dawn: "tts-dawn", day: "tts-day", dusk: "tts-dusk", night: "tts-osaka-jade" },
    syncTerminalBg: false,
    syncTerminalFg: false,
    syncHerdrTheme: false,
    hold: (options.hold ?? null) as HoldSetting,
  };
  const controller = createController({
    getSettings: () => ({ ...settings }),
    saveSettings: (update) => {
      settings = { ...settings, ...update } as typeof settings;
      return { ...settings };
    },
    getSlotForTime: options.slotAt ?? (() => "night"),
    themeNames: { dawn: "tts-dawn", day: "tts-day", dusk: "tts-dusk", night: "tts-osaka-jade" },
    themeLabels: { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" },
    terminalStream: { isTTY: false, write: () => true },
  });
  const commands: Record<
    string,
    {
      handler: (args: string, ctx: unknown) => Promise<void>;
      getArgumentCompletions: (p: string) => Array<{ value: string; label: string; description: string }> | null;
    }
  > = {};
  registerCommands({ registerCommand: (name: string, def: never) => (commands[name] = def) } as never, controller);
  const ui = makeUi();
  const ctx = { hasUI: true, mode: "tui", ui };
  return { controller, tts: commands["tts"], ui, ctx, current: () => settings };
}

describe("parseDuration", () => {
  it("accepts hours, minutes and both", () => {
    assert.equal(parseDuration("2h"), 2 * 3_600_000);
    assert.equal(parseDuration("90m"), 90 * 60_000);
    assert.equal(parseDuration("1h30m"), 90 * 60_000);
  });

  it("rejects malformed and zero durations", () => {
    for (const bad of ["", "2", "h", "2x", "0m", "1.5h", "-2h"]) {
      assert.equal(parseDuration(bad), undefined, bad);
    }
  });
});

describe("/tts hold", () => {
  it("holds a light theme over the night slot and releases back to the sun", async () => {
    const { controller, tts, ui, ctx, current } = setup();
    controller.handleSessionStart(ctx as never);
    assert.equal(ui.setThemeCalls.at(-1), "tts-osaka-jade");

    await tts.handler("hold light", ctx);
    assert.equal(ui.setThemeCalls.at(-1), "tts-day");
    assert.equal(current().hold?.slot, "day");
    assert.equal(controller.currentSlotLabel(), "Day");
    assert.match(ui.notifications.at(-1) ?? "", /Holding Day until/);

    await tts.handler("hold off", ctx);
    assert.equal(ui.setThemeCalls.at(-1), "tts-osaka-jade");
    assert.equal(current().hold, null);
    assert.equal(controller.currentSlotLabel(), "Night");
    controller.handleShutdown();
  });

  it("lasts until the next natural slot change when no duration is given", async () => {
    const change = new Date(Date.now() + 90 * 60_000);
    const { controller, tts, ctx } = setup({
      slotAt: (date) => (date.getTime() < change.getTime() ? "night" : "dawn"),
    });
    controller.handleSessionStart(ctx as never);

    await tts.handler("hold dark", ctx);
    const hold = controller.getHold();
    assert.ok(hold);
    assert.ok(Math.abs(hold.until.getTime() - change.getTime()) <= 60_000, "ends at the solar change");
    controller.handleShutdown();
  });

  it("honours an explicit duration", async () => {
    const { controller, tts, ctx } = setup();
    controller.handleSessionStart(ctx as never);
    const before = Date.now();

    await tts.handler("hold day 2h", ctx);
    const hold = controller.getHold();
    assert.ok(hold);
    const span = hold.until.getTime() - before;
    assert.ok(span >= 2 * 3_600_000 - 1_000 && span <= 2 * 3_600_000 + 5_000);
    controller.handleShutdown();
  });

  it("ignores an expired hold", () => {
    const { controller } = setup({
      hold: { slot: "day", until: new Date(Date.now() - 60_000).toISOString() },
    });
    assert.equal(controller.getHold(), null);
    assert.equal(controller.currentSlotLabel(), "Night");
  });

  it("refuses unknown targets and malformed durations without writing", async () => {
    const { tts, ui, ctx, current } = setup();
    await tts.handler("hold purple", ctx);
    await tts.handler("hold day soon", ctx);
    assert.equal(current().hold, null);
    assert.equal(ui.notifications.length, 2);
    for (const note of ui.notifications) assert.match(note, /Usage: \/tts hold/);
  });

  it("refuses to hold while rotation is off", async () => {
    const { tts, ui, ctx, current } = setup({ enabled: false });
    await tts.handler("hold light", ctx);
    assert.equal(current().hold, null);
    assert.match(ui.notifications.at(-1) ?? "", /rotation is off/);
  });

  it("reports when there is nothing to release", async () => {
    const { tts, ui, ctx } = setup();
    await tts.handler("hold off", ctx);
    assert.equal(ui.notifications.at(-1), "No hold is active");
  });
});

describe("/tts hold completions", () => {
  it("offers hold as a non-terminal and lists targets once it is typed", () => {
    const { tts } = setup();
    const root = tts.getArgumentCompletions("") ?? [];
    assert.equal(root.find((i) => i.label === "hold")?.value, "hold ");

    // Lazy parameter completion: the full token already yields its children.
    const children = tts.getArgumentCompletions("hold") ?? [];
    assert.deepEqual(
      children.map((i) => i.value),
      ["hold light", "hold dark", "hold dawn", "hold day", "hold dusk", "hold night", "hold off"],
    );
    assert.deepEqual(
      (tts.getArgumentCompletions("hold l") ?? []).map((i) => i.value),
      ["hold light"],
    );
  });

  it("marks the held slot and leaves the free-form duration alone", async () => {
    const { controller, tts, ctx } = setup();
    controller.handleSessionStart(ctx as never);
    await tts.handler("hold dusk", ctx);

    const children = tts.getArgumentCompletions("hold ") ?? [];
    assert.equal(children.find((i) => i.value === "hold dusk")?.label, "dusk ✓");
    assert.equal(children.find((i) => i.value === "hold off")?.label, "off");
    assert.equal(tts.getArgumentCompletions("hold dusk "), null);
    controller.handleShutdown();
  });
});

describe("hold settings", () => {
  const dir = mkdtempSync(join(tmpdir(), "tts-hold-"));
  const store = createSettingsStore(join(dir, "config.json"));
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("persists a valid hold and defaults to none", () => {
    assert.equal(store.get().hold, null);
    const until = new Date(Date.now() + 3_600_000).toISOString();
    assert.deepEqual(store.save({ hold: { slot: "night", until } }).hold, { slot: "night", until });
    assert.deepEqual(store.get().hold, { slot: "night", until });
  });

  it("drops a hold with an unknown slot or an unparseable time", () => {
    assert.equal(store.save({ hold: { slot: "purple", until: "2030-01-01T00:00:00Z" } as never }).hold, null);
    assert.equal(store.save({ hold: { slot: "day", until: "tomorrow-ish" } }).hold, null);
  });
});
