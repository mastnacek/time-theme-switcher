/**
 * Switcher slice — SettingsList-based settings screen for /theme-switcher.
 * Width safety (§7 SKILL.md): every line we render ourselves goes through
 * truncateToWidth; SettingsList/Input handle their own clamping.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  Input,
  SettingsList,
  truncateToWidth,
  type SettingItem,
} from "@earendil-works/pi-tui";
import { LOCALES, stringsFor } from "../../shared/i18n.ts";
import type { SwitcherController } from "./controller.ts";

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
    default:
      // Unknown setting id (e.g. the read-only "slot" row): ignore.
      return;
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
