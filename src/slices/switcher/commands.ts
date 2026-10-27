/**
 * Switcher slice — the /theme-switcher slash command.
 * Completions follow the trailing-space contract with lazy parameter
 * completion and current-value annotation (§3 SKILL.md).
 */

import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { LOCALES, stringsFor, type SwitcherStrings } from "../../shared/i18n.ts";
import type { Settings, SlotThemes } from "../../shared/settings.ts";
import type { SwitcherController } from "./controller.ts";
import { openSettingsUi } from "./settings-ui.ts";

/** `/tts hold` targets: slot names plus the light/dark aliases. */
const HOLD_TARGETS: Record<string, keyof SlotThemes> = {
  light: "day",
  dark: "night",
  dawn: "dawn",
  day: "day",
  dusk: "dusk",
  night: "night",
};

/** Subcommands whose enumerable parameters are offered as soon as they are typed. */
const NON_TERMINAL = new Set(["lang", "hold"]);

/** "2h", "90m", "1h30m" → milliseconds; undefined when malformed or zero. */
export function parseDuration(text: string): number | undefined {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?$/i.exec(text);
  if (!match || (match[1] === undefined && match[2] === undefined)) return undefined;
  const minutes = Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0);
  return minutes > 0 ? minutes * 60_000 : undefined;
}

/** Hold end as local clock time; the date is added when it is not today. */
export function formatUntil(until: Date, settings: Pick<Settings, "lang" | "timezone">): string {
  const locale = settings.lang === "cs" ? "cs-CZ" : "en-GB";
  const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" };
  if (until.toDateString() !== new Date().toDateString()) {
    options.day = "numeric";
    options.month = "numeric";
  }
  try {
    return until.toLocaleString(locale, { ...options, timeZone: settings.timezone });
  } catch {
    return until.toLocaleString(locale, options); // unknown IANA name in config
  }
}

function holdItems(
  controller: SwitcherController,
  s: SwitcherStrings,
  typed: string,
): AutocompleteItem[] | null {
  const hold = controller.getHold();
  const choices = [
    ...Object.keys(HOLD_TARGETS).map((key) => ({
      key,
      // Aliases are never marked: only the slot name itself shows the hold.
      active: hold !== null && hold.slot === key,
      description:
        key === "light"
          ? s.compHoldLight
          : key === "dark"
            ? s.compHoldDark
            : s.compHoldSlot(controller.slotLabel(key)),
    })),
    { key: "off", active: hold === null, description: s.compHoldOff },
  ];
  const items = choices
    .filter((c) => c.key.startsWith(typed))
    .map((c) => ({
      // Terminal: the optional duration is free-form, nothing to enumerate.
      value: `hold ${c.key}`,
      label: c.active ? `${c.key} ✓` : c.key,
      description: c.description + (c.active ? s.activeMarker : ""),
    }));
  return items.length > 0 ? items : null;
}

function complete(controller: SwitcherController, prefix: string): AutocompleteItem[] | null {
  const settings = controller.getSettings();
  const s = stringsFor(settings.lang);
  const tokens = prefix.split(/\s+/).filter(Boolean);
  const trailingSpace = /\s$/.test(prefix);
  const first = tokens[0]?.toLowerCase();

  // Lazy parameter completion: a fully typed non-terminal token ("lang",
  // "hold") already yields its values — after a trailing-space Tab the
  // engine never re-opens the picker.
  if (
    tokens.length > 1 ||
    (trailingSpace && tokens.length === 1) ||
    (first !== undefined && NON_TERMINAL.has(first))
  ) {
    if (first === "hold") {
      // A third token is the free-form duration.
      if (tokens.length > 2 || (tokens.length === 2 && trailingSpace)) return null;
      return holdItems(controller, s, (tokens[1] ?? "").toLowerCase());
    }
    if (first !== "lang") return null;
    const typed = (tokens[1] ?? "").toLowerCase();
    const items = LOCALES.filter((l) => l.startsWith(typed)).map((l) => ({
      value: `lang ${l}`, // full-prefix replacement; never annotate value
      label: settings.lang === l ? `${l} ✓` : l,
      description:
        (l === "cs" ? s.compLangCs : s.compLangEn) +
        (settings.lang === l ? s.activeMarker : ""),
    }));
    return items.length > 0 ? items : null;
  }

  const typed = first ?? "";
  const hold = controller.getHold();
  const subs: { key: string; description: string; nonTerminal?: boolean }[] = [
    { key: "on", description: s.compOn + (settings.enabled ? s.activeMarker : "") },
    { key: "off", description: s.compOff + (settings.enabled ? "" : s.activeMarker) },
    { key: "status", description: s.compStatus },
    { key: "refresh", description: s.compRefresh },
    {
      key: "hold",
      description:
        s.compHold +
        (hold ? s.statusHold(controller.slotLabel(hold.slot), formatUntil(hold.until, settings)) : ""),
      nonTerminal: true,
    },
    { key: "lang", description: `${s.compLang} · ${settings.lang}`, nonTerminal: true },
  ];
  const items = subs
    .filter((sub) => sub.key.startsWith(typed))
    .map((sub) => ({
      // Non-terminal choices get a trailing space; terminal ones don't.
      value: sub.nonTerminal ? `${sub.key} ` : sub.key,
      label: sub.key,
      description: sub.description,
    }));
  return items.length > 0 ? items : null;
}

async function handleCommand(
  controller: SwitcherController,
  args: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const s = stringsFor(controller.getSettings().lang);
  const [sub, ...rest] = args.split(/\s+/).filter(Boolean);
  switch (sub) {
    case undefined:
      if (ctx.mode !== "tui") {
        if (ctx.hasUI) ctx.ui.notify(s.tuiOnly, "error");
        return;
      }
      await openSettingsUi(controller, ctx);
      return;
    case "on":
      controller.setEnabled(true, ctx);
      return;
    case "off":
      controller.setEnabled(false, ctx);
      return;
    case "status":
      if (ctx.hasUI) {
        const settings = controller.getSettings();
        const hold = controller.getHold();
        ctx.ui.notify(
          s.statusText(
            settings.enabled ? s.on : s.off,
            controller.currentSlotLabel(),
            settings.latitude,
            settings.longitude,
          ) +
            (hold
              ? s.statusHold(controller.slotLabel(hold.slot), formatUntil(hold.until, settings))
              : ""),
        );
      }
      return;
    case "hold": {
      const target = (rest[0] ?? "").toLowerCase();
      if (target === "off") {
        const wasActive = controller.releaseHold();
        if (ctx.hasUI) {
          ctx.ui.notify(wasActive ? s.holdReleased(controller.currentSlotLabel()) : s.holdNone);
        }
        return;
      }
      const slot = HOLD_TARGETS[target];
      const durationMs = rest[1] === undefined ? undefined : parseDuration(rest[1]);
      if (slot === undefined || (rest[1] !== undefined && durationMs === undefined)) {
        if (ctx.hasUI) ctx.ui.notify(s.holdUsage, "warning");
        return; // usage error: refuse, write nothing
      }
      if (!controller.getSettings().enabled) {
        if (ctx.hasUI) ctx.ui.notify(s.holdRotationOff, "warning");
        return;
      }
      const hold = controller.hold(
        slot,
        durationMs === undefined ? undefined : new Date(Date.now() + durationMs),
      );
      if (ctx.hasUI) {
        ctx.ui.notify(
          s.holdSet(controller.slotLabel(hold.slot), formatUntil(hold.until, controller.getSettings())),
        );
      }
      return;
    }
    case "refresh":
    case "apply": {
      const res = controller.refresh(ctx.hasUI ? ctx.ui : undefined);
      if (ctx.hasUI) {
        if (res.success) {
          ctx.ui.notify(s.refreshed(controller.currentSlotLabel(), res.theme));
        } else {
          ctx.ui.notify(s.themeApplyFailed(res.theme), "error");
        }
      }
      return;
    }
    case "lang": {
      const code = rest[0] ?? "";
      if (!(LOCALES as readonly string[]).includes(code)) {
        if (ctx.hasUI) ctx.ui.notify(s.langUnknown(code || "?"), "error");
        return; // usage error: refuse, write nothing
      }
      controller.savePrefs({ lang: code });
      if (ctx.hasUI) ctx.ui.notify(stringsFor(controller.getSettings().lang).langSet(code));
      return;
    }
    default:
      if (ctx.hasUI) ctx.ui.notify(s.usage, "warning");
  }
}

export function registerCommands(pi: ExtensionAPI, controller: SwitcherController): void {
  const commandDef = {
    get description() {
      return stringsFor(controller.getSettings().lang).cmdDescription;
    },
    getArgumentCompletions: (prefix: string) => complete(controller, prefix),
    handler: (args: string, ctx: ExtensionCommandContext) =>
      handleCommand(controller, args.trim(), ctx),
  };

  pi.registerCommand("theme-switcher", commandDef);
  pi.registerCommand("tts", commandDef);
}
