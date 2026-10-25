/**
 * time-theme-switcher plugin — refactored to VSA layout (§6 SKILL.md).
 * Solar calculations moved to src/shared/solar.ts; rotation logic to slices/rotation/.
 */

import type { ExtensionAPI, SessionContext, PluginOptions } from "@earendil-works/pi-coding-agent";
import { getThemeForTime, THEME_LABELS, THEME_NAMES } from "./src/slices/rotation/index";
import { getLocationSettings } from "./src/slices/settings/index";

export default function register(pi: ExtensionAPI, options?: PluginOptions) {
  // Subagent recursion guard (§8 SKILL.md): skip registration entirely in
  // subagent / child-session processes — a top-level if cannot return in ESM.
  if (process.env.PI_SUBAGENT === "true" || Boolean(process.env.PI_CHILD_SESSION)) return;

  // Lifecycle: store unsubscribe handles (§4 SKILL.md)
  let unsubscribeInterval: (() => void) | null = null;
  let unsubscribeStart: (() => void) | null = null;
  let unsubscribeShutdown: (() => void) | null = null;

  unsubscribeStart = pi.on("session_start", (ctx: SessionContext) => {
    const settings = getLocationSettings();
    const now = new Date();
    const slot = getThemeForTime(now, settings.latitude, settings.longitude);
    const themeName = THEME_NAMES[slot];

    // Apply theme if UI present (§7 SKILL.md: guard hasUI / mode)
    if (ctx.hasUI && typeof ctx.ui?.setTheme === "function") {
      try {
        ctx.ui.setTheme(themeName);
      } catch {
        // Theme may not exist — ignore silently
      }
    }

    // Notify about current theme (TUI-safe, §7)
    if (ctx.hasUI && typeof ctx.ui?.notify === "function") {
      ctx.ui.notify(`Theme switched to ${THEME_LABELS[slot]}`);
    }

    // Start 60-second polling interval (§4: native timer, started from session_start)
    const timerId = setInterval(() => {
      const currentSlot = getThemeForTime(new Date(), settings.latitude, settings.longitude);
      if (ctx.hasUI && typeof ctx.ui?.setTheme === "function") {
        try {
          ctx.ui.setTheme(THEME_NAMES[currentSlot]);
        } catch {
          // Ignore missing theme
        }
      }
    }, 60000);

    unsubscribeInterval = () => clearInterval(timerId);
  });

  // Clean drain (§4 SKILL.md: store unsubscribe, drain in session_shutdown)
  // session_shutdown is the drainer itself — no need to store its handle
  unsubscribeShutdown = pi.on("session_shutdown", () => {
    if (unsubscribeInterval) {
      unsubscribeInterval();
      unsubscribeInterval = null;
    }
    if (unsubscribeStart) {
      unsubscribeStart();
      unsubscribeStart = null;
    }
  });
}