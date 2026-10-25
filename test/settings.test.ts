/**
 * Settings slice tests: first-run defaults, merge-on-load, persistence and
 * corrupt-config fallback. HOME is redirected to a temp dir BEFORE the module
 * is imported, because CONFIG_PATH is derived from homedir() at module top.
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

const fakeHome = mkdtempSync(join(tmpdir(), "tts-settings-"));
process.env.HOME = fakeHome;

// Dynamic import so the module sees the redirected HOME.
const { CONFIG_PATH, getSettings, saveSettings } = await import(
  "../src/slices/settings/index.ts"
);

describe("settings slice", () => {
  before(() => {
    assert.ok(
      CONFIG_PATH.startsWith(fakeHome),
      `CONFIG_PATH ${CONFIG_PATH} must live under the redirected HOME`,
    );
  });

  after(() => {
    rmSync(fakeHome, { recursive: true, force: true });
  });

  it("writes defaults on first run and returns them", () => {
    const settings = getSettings();
    assert.equal(settings.enabled, true);
    assert.equal(settings.latitude, 50.0755);
    assert.equal(settings.longitude, 14.4378);
    assert.equal(settings.timezone, "Europe/Prague");
    assert.equal(settings.lang, "en");
    // The file was created so the user has something to edit.
    const onDisk = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    assert.deepEqual(onDisk, settings);
  });

  it("merges a partial update and persists it", () => {
    const next = saveSettings({ enabled: false, latitude: 49.2 });
    assert.equal(next.enabled, false);
    assert.equal(next.latitude, 49.2);
    assert.equal(next.longitude, 14.4378); // untouched
    const reloaded = getSettings();
    assert.equal(reloaded.enabled, false);
    assert.equal(reloaded.latitude, 49.2);
  });

  it("merges old config files without enabled/lang over the defaults", () => {
    writeFileSync(
      CONFIG_PATH,
      JSON.stringify({ latitude: 10, longitude: 20, timezone: "UTC" }),
      "utf8",
    );
    const settings = getSettings();
    assert.equal(settings.enabled, true); // default
    assert.equal(settings.lang, "en"); // default
    assert.equal(settings.latitude, 10);
    assert.equal(settings.timezone, "UTC");
  });

  it("falls back to defaults on corrupt JSON", () => {
    writeFileSync(CONFIG_PATH, "{ not json", "utf8");
    const settings = getSettings();
    assert.equal(settings.enabled, true);
    assert.equal(settings.latitude, 50.0755);
  });

  it("falls back to defaults on wrong value types", () => {
    writeFileSync(CONFIG_PATH, JSON.stringify({ enabled: "yes" }), "utf8");
    const settings = getSettings();
    assert.equal(settings.enabled, true);
  });
});
