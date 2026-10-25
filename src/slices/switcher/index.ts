/**
 * Switcher slice barrel: composes controller + commands behind one factory.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { registerCommands } from "./commands.ts";
import { createController, type SwitcherDeps } from "./controller.ts";

export interface Switcher {
  handleSessionStart(ctx: ExtensionContext): void;
  handleShutdown(): void;
  registerCommands(pi: ExtensionAPI): void;
}

export function createSwitcher<Slot extends string>(deps: SwitcherDeps<Slot>): Switcher {
  const controller = createController(deps);
  return {
    handleSessionStart: (ctx) => controller.handleSessionStart(ctx),
    handleShutdown: () => controller.handleShutdown(),
    registerCommands: (pi) => registerCommands(pi, controller),
  };
}
