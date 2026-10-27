/**
 * Switcher slice — runtime controller: rotation timer, theme capture/restore
 * and the live settings copy. Contains no UI; the settings screen and the
 * slash commands live in settings-ui.ts and commands.ts.
 */

import type { ExtensionContext, ExtensionUIContext, Theme } from "@earendil-works/pi-coding-agent";
import { stringsFor } from "../../shared/i18n.ts";
import { BUNDLED_PALETTE_FILES, resolveBundledTheme } from "../../shared/palettes.ts";
import type { Settings, SlotThemes } from "../../shared/settings.ts";
import {
  resetTerminalBackground,
  resetTerminalForeground,
  resolveThemeBgHex,
  resolveThemeFgHex,
  syncTerminalBackground,
  syncTerminalForeground,
  type TerminalStream,
} from "./terminal.ts";
import { resolveHerdrTheme, syncHerdrTheme } from "./herdr.ts";

export interface SwitcherDeps<Slot extends string> {
  getSettings(): Settings;
  saveSettings(update: Partial<Settings>): Settings;
  getSlotForTime(date: Date, latitude: number, longitude: number): Slot;
  /** Pi theme file name per slot. */
  themeNames: Record<Slot, string>;
  /** Display label per slot. */
  themeLabels: Record<Slot, string>;
  /** Optional stream for OSC terminal sequences (defaults to process.stdout). */
  terminalStream?: TerminalStream;
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
  /** Recommended slot→theme mapping (shown as "Default" in the UI). */
  getDefaultThemes(): Record<string, string>;
}

const POLL_INTERVAL_MS = 60_000;

export function createController<Slot extends string>(
  deps: SwitcherDeps<Slot>,
): SwitcherController {
  let settings: Settings = deps.getSettings();
  let timer: ReturnType<typeof setInterval> | null = null;
  /** Theme active before rotation took over — restored when switched off. */
  let previousTheme: Theme | undefined;
  /** Last successfully applied slot+theme, for change detection. */
  let lastApplied: { slot: Slot; theme: string } | undefined;
  let activeUi: ExtensionUIContext | undefined;

  const canTheme = (ui: ExtensionUIContext | undefined): ui is ExtensionUIContext =>
    typeof ui?.setTheme === "function";

  function currentSlot(): Slot {
    return deps.getSlotForTime(new Date(), settings.latitude, settings.longitude);
  }

  /** User assignment from settings, falling back to the default mapping. */
  function themeForSlot(slot: Slot): string {
    return settings.themes?.[slot as keyof SlotThemes] ?? deps.themeNames[slot];
  }

  /**
   * Resolve an assignment: a bundled palette becomes an in-memory Theme
   * instance (never registered in Pi), anything else is applied by name.
   * A missing non-bundled name falls back to the bundled tts-<name> palette
   * when one exists — configs written before the tts- prefix (e.g.
   * "night": "osaka-jade") keep working after a package upgrade.
   */
  function resolveAssignment(name: string): string | Theme {
    const bundled = resolveBundledTheme(name);
    if (bundled) return bundled;
    const files: readonly string[] = BUNDLED_PALETTE_FILES;
    if (!files.includes(`${name}.json`) && files.includes(`tts-${name}.json`)) {
      return resolveBundledTheme(`tts-${name}`) ?? name;
    }
    return name;
  }

  function applySlot(ui: ExtensionUIContext): void {
    const slot = currentSlot();
    const name = themeForSlot(slot);
    if (lastApplied && lastApplied.slot === slot && lastApplied.theme === name) return;
    const result = ui.setTheme(resolveAssignment(name));
    const s = stringsFor(settings.lang);
    if (result.success) {
      lastApplied = { slot, theme: name };
      if (settings.syncTerminalBg) {
        const bgHex = resolveThemeBgHex(name, ui);
        if (bgHex) {
          syncTerminalBackground(bgHex, deps.terminalStream);
        } else {
          resetTerminalBackground(deps.terminalStream);
        }
      }
      if (settings.syncTerminalFg) {
        const fgHex = resolveThemeFgHex(name, ui);
        if (fgHex) {
          syncTerminalForeground(fgHex, deps.terminalStream);
        } else {
          resetTerminalForeground(deps.terminalStream);
        }
      }
      if (settings.syncHerdrTheme) {
        const herdrTheme = resolveHerdrTheme(slot, name, ui.theme?.appearance);
        syncHerdrTheme(herdrTheme);
      }
      ui.notify(s.switchedTo(name));
    } else {
      ui.notify(s.themeApplyFailed(name), "error");
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
    lastApplied = undefined; // force apply + notify
    applySlot(ui);
    timer = setInterval(() => {
      if (canTheme(activeUi)) applySlot(activeUi);
    }, POLL_INTERVAL_MS);
  }

  /** Disable rotation: stop polling and restore the pre-rotation theme. */
  function stop(ui: ExtensionUIContext | undefined): void {
    stopTimer();
    lastApplied = undefined;
    if (settings.syncTerminalBg) {
      resetTerminalBackground(deps.terminalStream);
    }
    if (settings.syncTerminalFg) {
      resetTerminalForeground(deps.terminalStream);
    }
    const s = stringsFor(settings.lang);
    if (canTheme(ui)) {
      if (previousTheme) {
        const restored = previousTheme;
        previousTheme = undefined;
        // Previous theme may itself have been a bundled in-memory instance.
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
      lastApplied = undefined;
      previousTheme = undefined;
      if (!settings.enabled || !ctx.hasUI) return;
      start(ctx.ui);
    },

    handleShutdown(): void {
      // No theme restore here: the session is ending, and a following
      // session fires its own session_start.
      stopTimer();
      if (settings.syncTerminalBg) {
        resetTerminalBackground(deps.terminalStream);
      }
      if (settings.syncTerminalFg) {
        resetTerminalForeground(deps.terminalStream);
      }
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
      const prevSyncBg = settings.syncTerminalBg;
      const prevSyncFg = settings.syncTerminalFg;
      settings = deps.saveSettings(update);
      if (prevSyncBg && !settings.syncTerminalBg) {
        resetTerminalBackground(deps.terminalStream);
      } else if (!prevSyncBg && settings.syncTerminalBg && lastApplied) {
        const bgHex = resolveThemeBgHex(lastApplied.theme, activeUi);
        if (bgHex) {
          syncTerminalBackground(bgHex, deps.terminalStream);
        }
      }
      if (prevSyncFg && !settings.syncTerminalFg) {
        resetTerminalForeground(deps.terminalStream);
      } else if (!prevSyncFg && settings.syncTerminalFg && lastApplied) {
        const fgHex = resolveThemeFgHex(lastApplied.theme, activeUi);
        if (fgHex) {
          syncTerminalForeground(fgHex, deps.terminalStream);
        }
      }
      if (settings.syncHerdrTheme && lastApplied) {
        const herdrTheme = resolveHerdrTheme(
          lastApplied.slot,
          lastApplied.theme,
          activeUi?.theme?.appearance,
        );
        syncHerdrTheme(herdrTheme);
      }
      // Re-apply immediately when the assignment for the active slot changed.
      if (timer !== null && canTheme(activeUi)) applySlot(activeUi);
      return settings;
    },

    currentSlotLabel: () => deps.themeLabels[currentSlot()],

    getDefaultThemes: () => ({ ...deps.themeNames }),
  };
}
