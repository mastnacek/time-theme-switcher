/** Terminal background sync tests: OSC emission, color parsing, and palette bg resolution. */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import {
  resetTerminalBackground,
  resetTerminalForeground,
  resolveThemeBgHex,
  resolveThemeFgHex,
  syncTerminalBackground,
  syncTerminalForeground,
  toHexColor,
  type TerminalStream,
} from "../src/slices/switcher/terminal.ts";

function createMockStream(isTTY: boolean): TerminalStream & { output: string } {
  let output = "";
  return {
    isTTY,
    write(data: string) {
      output += data;
      return true;
    },
    get output() {
      return output;
    },
  };
}

describe("terminal background synchronization (OSC 11 / 111)", () => {
  it("syncTerminalBackground writes OSC 11 sequence when isTTY is true", () => {
    const stream = createMockStream(true);
    syncTerminalBackground("#fdf6e3", stream);
    assert.equal(stream.output, "\x1b]11;#fdf6e3\x07");
  });

  it("syncTerminalBackground skips emission when isTTY is false", () => {
    const stream = createMockStream(false);
    syncTerminalBackground("#fdf6e3", stream);
    assert.equal(stream.output, "");
  });

  it("resetTerminalBackground writes OSC 111 sequence when isTTY is true", () => {
    const stream = createMockStream(true);
    resetTerminalBackground(stream);
    assert.equal(stream.output, "\x1b]111\x07");
  });

  it("resetTerminalBackground skips emission when isTTY is false", () => {
    const stream = createMockStream(false);
    resetTerminalBackground(stream);
    assert.equal(stream.output, "");
  });
});

describe("terminal foreground synchronization (OSC 10 / 110)", () => {
  it("syncTerminalForeground writes OSC 10 sequence when isTTY is true", () => {
    const stream = createMockStream(true);
    syncTerminalForeground("#657b83", stream);
    assert.equal(stream.output, "\x1b]10;#657b83\x07");
  });

  it("syncTerminalForeground skips emission when isTTY is false", () => {
    const stream = createMockStream(false);
    syncTerminalForeground("#657b83", stream);
    assert.equal(stream.output, "");
  });

  it("resetTerminalForeground writes OSC 110 sequence when isTTY is true", () => {
    const stream = createMockStream(true);
    resetTerminalForeground(stream);
    assert.equal(stream.output, "\x1b]110\x07");
  });

  it("resetTerminalForeground skips emission when isTTY is false", () => {
    const stream = createMockStream(false);
    resetTerminalForeground(stream);
    assert.equal(stream.output, "");
  });
});

describe("toHexColor", () => {
  it("converts hex, short hex and okhsl color values to 6-digit hex", () => {
    assert.equal(toHexColor("#32302f"), "#32302f");
    assert.equal(toHexColor("#fdf6e3"), "#fdf6e3");
    assert.equal(toHexColor("#fff"), "#ffffff");
    assert.equal(toHexColor("okhsl(18 25% 8%)"), "#180e0e");
    assert.equal(toHexColor("#1A221E"), "#1a221e");
  });

  it("returns undefined for empty or invalid color strings", () => {
    assert.equal(toHexColor(""), undefined);
    assert.equal(toHexColor("   "), undefined);
    assert.equal(toHexColor("not-a-color-at-all-xyz"), undefined);
  });
});

describe("resolveThemeFgHex", () => {
  it("resolves foreground hex colors for bundled palettes by name or prefixed name", () => {
    assert.equal(resolveThemeFgHex("tts-day"), "#586e75");
    assert.equal(resolveThemeFgHex("day"), "#586e75");

    assert.equal(resolveThemeFgHex("tts-dawn"), "#d4be98");
    assert.equal(resolveThemeFgHex("dawn"), "#d4be98");

    assert.equal(resolveThemeFgHex("tts-dusk"), "#cad3f5");
    assert.equal(resolveThemeFgHex("dusk"), "#cad3f5");

    assert.equal(resolveThemeFgHex("tts-night"), "#eae7e8");
    assert.equal(resolveThemeFgHex("night"), "#eae7e8");

    assert.equal(resolveThemeFgHex("tts-osaka-jade"), "#d4c8a0");
    assert.equal(resolveThemeFgHex("osaka-jade"), "#d4c8a0");
  });

  it("resolves foreground from custom registered theme JSON on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-theme-fg-test-"));
    const customThemeFile = join(dir, "custom.json");
    try {
      writeFileSync(
        customThemeFile,
        JSON.stringify({
          name: "my-custom-theme-2",
          vars: { fg: "#aabbcc" },
          colors: { bg: "#000000" },
        }),
      );

      const mockUi = {
        getAllThemes: () => [{ name: "my-custom-theme-2", path: customThemeFile }],
      } as unknown as ExtensionUIContext;

      const hex = resolveThemeFgHex("my-custom-theme-2", mockUi);
      assert.equal(hex, "#aabbcc");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveThemeBgHex", () => {
  it("resolves background hex colors for bundled palettes by name or prefixed name", () => {
    assert.equal(resolveThemeBgHex("tts-dawn"), "#32302f");
    assert.equal(resolveThemeBgHex("dawn"), "#32302f");

    assert.equal(resolveThemeBgHex("tts-day"), "#fdf6e3");
    assert.equal(resolveThemeBgHex("day"), "#fdf6e3");

    assert.equal(resolveThemeBgHex("tts-dusk"), "#24273a");
    assert.equal(resolveThemeBgHex("dusk"), "#24273a");

    assert.equal(resolveThemeBgHex("tts-night"), "#180e0e");
    assert.equal(resolveThemeBgHex("night"), "#180e0e");

    assert.equal(resolveThemeBgHex("tts-osaka-jade"), "#1a221e");
    assert.equal(resolveThemeBgHex("osaka-jade"), "#1a221e");
  });

  it("returns undefined for non-existent theme with no UI context", () => {
    assert.equal(resolveThemeBgHex("non-existent-theme-xyz"), undefined);
  });

  it("resolves background from custom registered theme JSON on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "tts-theme-test-"));
    const customThemeFile = join(dir, "custom.json");
    try {
      writeFileSync(
        customThemeFile,
        JSON.stringify({
          name: "my-custom-theme",
          vars: { bg: "#443322" },
          colors: { text: "#ffffff" },
        }),
      );

      const mockUi = {
        getAllThemes: () => [{ name: "my-custom-theme", path: customThemeFile }],
      } as unknown as ExtensionUIContext;

      const hex = resolveThemeBgHex("my-custom-theme", mockUi);
      assert.equal(hex, "#443322");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
