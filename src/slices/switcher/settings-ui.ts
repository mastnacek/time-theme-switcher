/**
 * Switcher slice — SettingsList-based settings screen for /theme-switcher.
 * Width safety (§7 SKILL.md): every line we render ourselves goes through
 * truncateToWidth; SettingsList/Input handle their own clamping.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSelectListTheme, getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Input,
  SelectList,
  SettingsList,
  truncateToWidth,
  type SelectItem,
  type SettingItem,
} from "@earendil-works/pi-tui";
import { LOCALES, stringsFor } from "../../shared/i18n.ts";
import { bundledThemeNames } from "../../shared/palettes.ts";
import type { SlotThemes } from "../../shared/settings.ts";
import type { SwitcherController } from "./controller.ts";

const SLOT_IDS = ["dawn", "day", "dusk", "night"] as const;

function textSubmenu(title: string, hint: string): NonNullable<SettingItem["submenu"]> {
  return (currentValue, done) => {
    const input = new Input();
    input.setValue(currentValue);
    input.focused = true;
    input.onSubmit = (value) => done(value);
    input.onEscape = () => done();
    return {
      render: (width: number) => [
        truncateToWidth(` ${title}`, width),
        ...input.render(width),
        "",
        truncateToWidth(` ${hint}`, width),
      ],
      invalidate() {},
      handleInput: (data: string) => input.handleInput(data),
    };
  };
}

/**
 * Theme picker submenu for one slot: a SelectList over every theme the slot
 * can use — registered Pi themes (ctx.ui.getAllThemes) plus the plugin's
 * bundled palettes, which are private and never appear in Pi's own lists.
 * The slot's recommended default is tagged "(Default)" in the label; the
 * current assignment gets a ✓ (§3 SKILL.md).
 */
function themePickerSubmenu(
  controller: SwitcherController,
  ctx: ExtensionCommandContext,
  slot: (typeof SLOT_IDS)[number],
): NonNullable<SettingItem["submenu"]> {
  return (currentValue, done) => {
    const s = stringsFor(controller.getSettings().lang);
    const defaultName = controller.getDefaultThemes()[slot];
    const registered = new Set(
      ctx.ui.getAllThemes().map((t) => t.name),
    );
    const names = [
      ...new Set([...bundledThemeNames(), ...registered]),
    ].sort((a, b) => a.localeCompare(b));
    const items: SelectItem[] = names.map((name) => ({
      value: name,
      label:
        name +
        (name === currentValue ? " ✓" : "") +
        (name === defaultName ? ` ${s.defaultTag}` : ""),
      description: name === defaultName ? s.themeRowDesc(defaultName) : undefined,
    }));
    const select = new SelectList(
      items,
      Math.min(items.length, 10),
      getSelectListTheme(),
    );
    const currentIndex = names.indexOf(currentValue);
    if (currentIndex >= 0) select.setSelectedIndex(currentIndex);
    select.onSelect = (item) => done(item.value);
    select.onCancel = () => done();
    return {
      render: (width: number) => [
        truncateToWidth(` ${s.pickerTitle(s.slotNames[slot])}`, width),
        ...select.render(width),
        truncateToWidth(` ${s.pickerHint}`, width),
      ],
      invalidate: () => select.invalidate(),
      handleInput: (data: string) => select.handleInput(data),
    };
  };
}

function onSettingChange(
  controller: SwitcherController,
  ctx: ExtensionCommandContext,
  list: SettingsList,
  id: string,
  value: string,
): void {
  const s = stringsFor(controller.getSettings().lang);
  switch (id) {
    case "enabled":
      controller.setEnabled(value === s.on, ctx);
      return;
    case "latitude": {
      const n = Number(value);
      if (!Number.isFinite(n) || n < -90 || n > 90) {
        ctx.ui.notify(s.invalidLatitude, "error");
        list.updateValue(id, String(controller.getSettings().latitude));
        return;
      }
      controller.savePrefs({ latitude: n });
      list.updateValue(id, String(n));
      return;
    }
    case "longitude": {
      const n = Number(value);
      if (!Number.isFinite(n) || n < -180 || n > 180) {
        ctx.ui.notify(s.invalidLongitude, "error");
        list.updateValue(id, String(controller.getSettings().longitude));
        return;
      }
      controller.savePrefs({ longitude: n });
      list.updateValue(id, String(n));
      return;
    }
    case "timezone": {
      const tz = value.trim();
      if (!tz) {
        ctx.ui.notify(s.invalidTimezone, "error");
        list.updateValue(id, controller.getSettings().timezone);
        return;
      }
      controller.savePrefs({ timezone: tz });
      list.updateValue(id, tz);
      return;
    }
    case "lang":
      controller.savePrefs({ lang: value });
      ctx.ui.notify(stringsFor(controller.getSettings().lang).langSet(value));
      return;
    case "syncTerminalBg":
      controller.savePrefs({ syncTerminalBg: value === s.on });
      list.updateValue(id, value);
      return;
    default: {
      if (!id.startsWith("theme:")) return; // e.g. the read-only "slot" row
      const slot = id.slice("theme:".length) as keyof SlotThemes;
      const name = value.trim();
      const known =
        bundledThemeNames().includes(name) ||
        ctx.ui.getAllThemes().some((t) => t.name === name);
      if (!name || !known) {
        ctx.ui.notify(s.invalidTheme(name || "?"), "error");
        list.updateValue(id, controller.getSettings().themes[slot]);
        return;
      }
      controller.savePrefs({ themes: { ...controller.getSettings().themes, [slot]: name } });
      list.updateValue(id, name);
      return;
    }
  }
}

export async function openSettingsUi(
  controller: SwitcherController,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const s = stringsFor(controller.getSettings().lang);
  const settings = controller.getSettings();

  await ctx.ui.custom((tui, theme, _keybindings, done) => {
    const items: SettingItem[] = [
      {
        id: "enabled",
        label: s.enabledLabel,
        description: s.enabledDesc,
        currentValue: settings.enabled ? s.on : s.off,
        values: [s.on, s.off],
      },
      {
        id: "syncTerminalBg",
        label: s.syncTerminalBgLabel,
        description: s.syncTerminalBgDesc,
        currentValue: settings.syncTerminalBg ? s.on : s.off,
        values: [s.on, s.off],
      },
      {
        id: "latitude",
        label: s.latitudeLabel,
        description: s.latitudeDesc,
        currentValue: String(settings.latitude),
        submenu: textSubmenu(s.latitudeLabel, s.editHint),
      },
      {
        id: "longitude",
        label: s.longitudeLabel,
        description: s.longitudeDesc,
        currentValue: String(settings.longitude),
        submenu: textSubmenu(s.longitudeLabel, s.editHint),
      },
      {
        id: "timezone",
        label: s.timezoneLabel,
        description: s.timezoneDesc,
        currentValue: settings.timezone,
        submenu: textSubmenu(s.timezoneLabel, s.editHint),
      },
      ...SLOT_IDS.map((slot) => ({
        id: `theme:${slot}`,
        label: s.themeRowLabel(s.slotNames[slot]),
        description: s.themeRowDesc(controller.getDefaultThemes()[slot]),
        currentValue: settings.themes[slot],
        submenu: themePickerSubmenu(controller, ctx, slot),
      })),
      {
        id: "lang",
        label: s.languageLabel,
        description: s.languageDesc,
        currentValue: settings.lang,
        values: [...LOCALES],
      },
      {
        id: "slot",
        label: s.slotLabel,
        description: s.slotDesc,
        currentValue: controller.currentSlotLabel(),
      },
    ];

    const container = new Container();
    container.addChild({
      render: (width: number) => [
        truncateToWidth(theme.fg("accent", theme.bold(s.settingsTitle)), width),
        "",
      ],
      invalidate() {},
    });

    const list = new SettingsList(
      items,
      Math.min(items.length + 2, 15),
      getSettingsListTheme(),
      (id, value) => onSettingChange(controller, ctx, list, id, value),
      () => done(undefined),
    );
    container.addChild(list);

    return {
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        list.handleInput(data);
        tui.requestRender();
      },
    };
  });
}
