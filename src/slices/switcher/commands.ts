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
import { LOCALES, stringsFor } from "../../shared/i18n.ts";
import type { SwitcherController } from "./controller.ts";
import { openSettingsUi } from "./settings-ui.ts";

function complete(controller: SwitcherController, prefix: string): AutocompleteItem[] | null {
  const settings = controller.getSettings();
  const s = stringsFor(settings.lang);
  const tokens = prefix.split(/\s+/).filter(Boolean);
  const trailingSpace = /\s$/.test(prefix);
  const first = tokens[0]?.toLowerCase();

  // Lazy parameter completion: a fully typed non-terminal token ("lang")
  // already yields its values — after a trailing-space Tab the engine never
  // re-opens the picker.
  if (tokens.length > 1 || (trailingSpace && tokens.length === 1) || first === "lang") {
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
  const subs: { key: string; description: string; nonTerminal?: boolean }[] = [
    { key: "on", description: s.compOn + (settings.enabled ? s.activeMarker : "") },
    { key: "off", description: s.compOff + (settings.enabled ? "" : s.activeMarker) },
    { key: "status", description: s.compStatus },
    { key: "refresh", description: s.compRefresh },
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
        ctx.ui.notify(
          s.statusText(
            settings.enabled ? s.on : s.off,
            controller.currentSlotLabel(),
            settings.latitude,
            settings.longitude,
          ),
        );
      }
      return;
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
