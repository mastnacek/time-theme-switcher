/**
 * time-theme-switcher plugin — thin composition root (§6 SKILL.md).
 * Wires the rotation slice (solar elevation → theme slot) and the settings
 * slice (global config) into the switcher slice (timer, commands, UI).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getThemeForTime, THEME_LABELS, THEME_NAMES } from "./src/slices/rotation/index.ts";
import { getSettings, saveSettings } from "./src/slices/settings/index.ts";
import { createSwitcher } from "./src/slices/switcher/index.ts";

export default function register(pi: ExtensionAPI) {
  // Subagent recursion guard (§8 SKILL.md): skip registration entirely in
  // subagent / child-session processes — a top-level if cannot return in ESM.
  if (process.env.PI_SUBAGENT === "true" || Boolean(process.env.PI_CHILD_SESSION)) return;

  const switcher = createSwitcher({
    getSettings,
    saveSettings,
    getSlotForTime: getThemeForTime,
    themeNames: THEME_NAMES,
    themeLabels: THEME_LABELS,
  });

  switcher.registerCommands(pi);

  // Lifecycle (§4 SKILL.md): store unsubscribe handles; session_shutdown is
  // the drainer itself, so only session_start's handle is stored.
  const unsubscribeStart = pi.on("session_start", (_event, ctx) => {
    switcher.handleSessionStart(ctx);
  });

  pi.on("session_shutdown", () => {
    switcher.handleShutdown();
    unsubscribeStart();
  });
}
