/**
 * Switcher slice — runtime controller: rotation timer, theme capture/restore
 * and the live settings copy. Contains no UI; the settings screen and the
 * slash commands live in settings-ui.ts and commands.ts.
 */

import type { ExtensionContext, ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { stringsFor } from "../../shared/i18n.ts";
import type { Settings } from "../../shared/settings.ts";

export interface SwitcherDeps<Slot extends string> {
  getSettings(): Settings;
  saveSettings(update: Partial<Settings>): Settings;
  getSlotForTime(date: Date, latitude: number, longitude: number): Slot;
  /** Pi theme file name per slot. */
  themeNames: Record<Slot, string>;
  /** Display label per slot. */
  themeLabels: Record<Slot, string>;
}

export interface SwitcherController {
  handleSessionStart(ctx: ExtensionContext): void;
  handleShutdown(): void;
  /** Live settings copy (refreshed on session_start and every save). */
  getSettings(): Settings;
  /** Persist the toggle and apply it immediately (start/stop + restore). */
  setEnabled(enabled: boolean, ctx: ExtensionContext): void;
  /** Persist non-toggle updates and refresh the live copy. */
  savePrefs(update: Partial<Settings>): Settings;
  /** Display label of the slot the current time/location maps to. */
  currentSlotLabel(): string;
}

const POLL_INTERVAL_MS = 60_000;

export function createController<Slot extends string>(
  deps: SwitcherDeps<Slot>,
): SwitcherController {
  let settings: Settings = deps.getSettings();
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Theme active before rotation took over — restored when switched off. */
  let previousTheme: Theme | undefined;
  let lastSlot: Slot | undefined;
  let activeUi: ExtensionUIContext | undefined;

  const canTheme = (ui: ExtensionUIContext | undefined): ui is ExtensionUIContext =>
    typeof ui?.setTheme === "function";

  function currentSlot(): Slot {
    return deps.getSlotForTime(new Date(), settings.latitude, settings.longitude);
  }

  function applySlot(ui: ExtensionUIContext): void {
    const slot = currentSlot();
    if (slot === lastSlot) return;
    lastSlot = slot;
    const result = ui.setTheme(deps.themeNames[slot]);
    if (result.success) {
      ui.notify(stringsFor(settings.lang).switchedTo(deps.themeLabels[slot]));
    }
  }

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** Enable rotation: capture the current theme, apply the slot, start polling. */
  function start(ui: ExtensionUIContext): void {
    if (!canTheme(ui)) return;
    activeUi = ui;
    previousTheme ??= ui.theme;
    stopTimer();
    lastSlot = undefined; // force apply + notify
    applySlot(ui);
    timer = setInterval(() => {
      if (canTheme(activeUi)) applySlot(activeUi);
    }, POLL_INTERVAL_MS);
  }

  /** Disable rotation: stop polling and restore the pre-rotation theme. */
  function stop(ui: ExtensionUIContext | undefined): void {
    stopTimer();
    lastSlot = undefined;
    const s = stringsFor(settings.lang);
    if (canTheme(ui)) {
      if (previousTheme) {
        const restored = previousTheme;
        previousTheme = undefined;
        const result = ui.setTheme(restored);
        if (result.success) ui.notify(s.restoredTheme(restored.name ?? "?"));
      } else {
        ui.notify(s.rotationDisabled);
      }
    }
    previousTheme = undefined;
  }

  return {
    handleSessionStart(ctx: ExtensionContext): void {
      settings = deps.getSettings();
      stopTimer();
      lastSlot = undefined;
      previousTheme = undefined;
      if (!settings.enabled || !ctx.hasUI) return;
      start(ctx.ui);
    },

    handleShutdown(): void {
      // No theme restore here: the session is ending, and a following
      // session fires its own session_start.
      stopTimer();
      activeUi = undefined;
    },

    getSettings: () => settings,

    setEnabled(enabled: boolean, ctx: ExtensionContext): void {
      settings = deps.saveSettings({ enabled });
      if (enabled) {
        if (ctx.hasUI) start(ctx.ui);
      } else {
        stop(ctx.hasUI ? ctx.ui : undefined);
      }
    },

    savePrefs(update: Partial<Settings>): Settings {
      settings = deps.saveSettings(update);
      return settings;
    },

    currentSlotLabel: () => deps.themeLabels[currentSlot()],
  };
}
