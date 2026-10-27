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
import {
  resolveHerdrTheme,
  syncHerdrTheme,
  type SyncHerdrOptions,
  type SyncHerdrResult,
} from "./herdr.ts";

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
  /** Optional synchronizer for Herdr multiplexer theme (defaults to syncHerdrTheme). */
  syncHerdr?: (
    herdrThemeName: string,
    options?: SyncHerdrOptions,
  ) => SyncHerdrResult;
}

export interface RefreshResult {
  slot: string;
  theme: string;
  herdrTheme?: string;
  success: boolean;
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
  /** Force refresh and re-synchronize the current theme, terminal, and Herdr. */
  refresh(ui?: ExtensionUIContext): RefreshResult;
  /** Display label of the active slot (a hold wins over the sun). */
  currentSlotLabel(): string;
  /** Display label of any slot. */
  slotLabel(slot: string): string;
  /** The hold in force now, or null when the solar slot rules. */
  getHold(): ActiveHold | null;
  /**
   * Hold `slot` until `until`; without `until` the hold lasts until the
   * solar slot next changes (e.g. lights on at dusk → until morning twilight).
   */
  hold(slot: keyof SlotThemes, until?: Date): ActiveHold;
  /** End the hold and return to the solar slot; false when none was active. */
  releaseHold(): boolean;
  /** Recommended slot→theme mapping (shown as "Default" in the UI). */
  getDefaultThemes(): Record<string, string>;
}

export interface ActiveHold {
  slot: string;
  until: Date;
}

const POLL_INTERVAL_MS = 60_000;
/** Search horizon for the next natural slot change (polar summers aside). */
const HOLD_SCAN_LIMIT_MIN = 36 * 60;

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
  let autoSwitchNotified = false;

  const canTheme = (ui: ExtensionUIContext | undefined): ui is ExtensionUIContext =>
    typeof ui?.setTheme === "function";

  const syncHerdr = deps.syncHerdr ?? syncHerdrTheme;

  function handleHerdrSync(
    herdrTheme: string,
    sidebarBg?: string,
    ui?: ExtensionUIContext,
  ): void {
    const result = syncHerdr(herdrTheme, { sidebarBg });
    if (result.autoSwitchDisabled && !autoSwitchNotified) {
      autoSwitchNotified = true;
      if (canTheme(ui)) {
        const s = stringsFor(settings.lang);
        ui.notify(s.herdrAutoSwitchDisabled);
      }
    }
  }

  function naturalSlot(at: Date = new Date()): Slot {
    return deps.getSlotForTime(at, settings.latitude, settings.longitude);
  }

  /** The hold in force at `at`, or null when there is none or it expired. */
  function activeHold(at: Date = new Date()): ActiveHold | null {
    const hold = settings.hold;
    if (!hold) return null;
    const until = new Date(hold.until);
    return until.getTime() > at.getTime() ? { slot: hold.slot, until } : null;
  }

  function currentSlot(): Slot {
    return (activeHold()?.slot as Slot | undefined) ?? naturalSlot();
  }

  /** First minute after `from` whose solar slot differs from the one at `from`. */
  function nextNaturalChange(from: Date): Date {
    const start = naturalSlot(from);
    for (let minute = 1; minute <= HOLD_SCAN_LIMIT_MIN; minute++) {
      const at = new Date(from.getTime() + minute * 60_000);
      if (naturalSlot(at) !== start) return at;
    }
    return new Date(from.getTime() + HOLD_SCAN_LIMIT_MIN * 60_000);
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

  function applySlot(ui: ExtensionUIContext, options: { silent?: boolean } = {}): boolean {
    const slot = currentSlot();
    const name = themeForSlot(slot);
    if (lastApplied && lastApplied.slot === slot && lastApplied.theme === name) return true;
    const result = ui.setTheme(resolveAssignment(name));
    const s = stringsFor(settings.lang);
    if (result.success) {
      lastApplied = { slot, theme: name };
      const bgHex = resolveThemeBgHex(name, ui);
      if (settings.syncTerminalBg) {
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
        handleHerdrSync(herdrTheme, bgHex, ui);
      }
      if (!options.silent) ui.notify(s.switchedTo(name));
      return true;
    } else {
      if (!options.silent) ui.notify(s.themeApplyFailed(name), "error");
      return false;
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
      // Re-read the shared config: a hold set or released in another pi
      // session lives there. An expired hold is cleared for everyone.
      settings = deps.getSettings();
      if (settings.hold && !activeHold()) settings = deps.saveSettings({ hold: null });
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
        const bgHex = resolveThemeBgHex(lastApplied.theme, activeUi);
        handleHerdrSync(herdrTheme, bgHex, activeUi);
      }
      // Re-apply immediately when the assignment for the active slot changed.
      if (timer !== null && canTheme(activeUi)) applySlot(activeUi);
      return settings;
    },

    refresh(ui?: ExtensionUIContext): RefreshResult {
      settings = deps.getSettings();
      lastApplied = undefined;
      const targetUi = ui ?? activeUi;
      const slot = currentSlot();
      const name = themeForSlot(slot);
      if (canTheme(targetUi)) {
        activeUi = targetUi;
        const success = applySlot(targetUi, { silent: true });
        const herdrTheme = settings.syncHerdrTheme
          ? resolveHerdrTheme(slot, name, targetUi.theme?.appearance)
          : undefined;
        return { slot, theme: name, herdrTheme, success };
      }
      let herdrTheme: string | undefined;
      if (settings.syncHerdrTheme) {
        herdrTheme = resolveHerdrTheme(slot, name);
        const bgHex = resolveThemeBgHex(name, targetUi);
        handleHerdrSync(herdrTheme, bgHex, targetUi);
      }
      return { slot, theme: name, herdrTheme, success: true };
    },

    currentSlotLabel: () => deps.themeLabels[currentSlot()],

    slotLabel: (slot) => deps.themeLabels[slot as Slot] ?? slot,

    getHold: () => activeHold(),

    hold(slot, until) {
      const end = until ?? nextNaturalChange(new Date());
      settings = deps.saveSettings({ hold: { slot, until: end.toISOString() } });
      if (timer !== null && canTheme(activeUi)) applySlot(activeUi);
      return { slot, until: end };
    },

    releaseHold() {
      const wasActive = activeHold() !== null;
      settings = deps.saveSettings({ hold: null });
      if (timer !== null && canTheme(activeUi)) applySlot(activeUi);
      return wasActive;
    },

    getDefaultThemes: () => ({ ...deps.themeNames }),
  };
}
