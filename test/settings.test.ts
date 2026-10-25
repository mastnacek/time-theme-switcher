/**
 * Settings slice tests: first-run defaults, per-field sanitization,
 * self-healing upgrades, persistence and atomic writes. The store path is
 * injected (repository pattern), so tests never touch the real home dir.
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { CONFIG_PATH, createSettingsStore } from "../src/slices/settings/index.ts";

const fakeDir = mkdtempSync(join(tmpdir(), "tts-settings-"));
const configPath = join(fakeDir, "config.json");
const store = createSettingsStore(configPath);

const readDisk = () => JSON.parse(readFileSync(configPath, "utf8"));

after(() => {
  rmSync(fakeDir, { recursive: true, force: true });
});

describe("settings slice", () => {
  it("points the default config path at ~/.pi/agent/time-theme-switcher.json", () => {
    assert.ok(CONFIG_PATH.endsWith(join(".pi", "agent", "time-theme-switcher.json")));
  });

  it("writes defaults on first run and returns them", () => {
    const settings = store.get();
    assert.equal(settings.enabled, true);
    assert.equal(settings.latitude, 50.0755);
    assert.equal(settings.longitude, 14.4378);
    assert.equal(settings.timezone, "Europe/Prague");
    assert.equal(settings.lang, "en");
    assert.deepEqual(settings.themes, {
      dawn: "dawn",
      day: "day",
      dusk: "dusk",
      night: "osaka-jade",
    });
    // The file was created so the user has something to edit.
    assert.deepEqual(readDisk(), settings);
  });

  it("merges a partial update and persists it", () => {
    const next = store.save({ enabled: false, latitude: 49.2 });
    assert.equal(next.enabled, false);
    assert.equal(next.latitude, 49.2);
    assert.equal(next.longitude, 14.4378); // untouched
    const reloaded = store.get();
    assert.equal(reloaded.enabled, false);
    assert.equal(reloaded.latitude, 49.2);
  });

  it("upgrades old configs on load: missing keys take defaults, file self-heals", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ latitude: 10, longitude: 20, timezone: "UTC" }),
      "utf8",
    );
    const settings = store.get();
    assert.equal(settings.enabled, true); // default
    assert.equal(settings.lang, "en"); // default
    assert.equal(settings.latitude, 10); // preserved
    assert.equal(settings.timezone, "UTC"); // preserved
    assert.deepEqual(settings.themes.dawn, "dawn"); // added by the upgrade
    // Self-healing: the file on disk now carries the full current schema.
    const onDisk = readDisk();
    assert.equal(onDisk.enabled, true);
    assert.deepEqual(onDisk.themes, settings.themes);
  });

  it("falls back per field: a corrupt value does not reset valid siblings", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ enabled: "yes", latitude: 49.2 }),
      "utf8",
    );
    const settings = store.get();
    assert.equal(settings.enabled, true); // invalid → default
    assert.equal(settings.latitude, 49.2); // valid sibling survives
  });

  it("merges a partial themes object per slot over the defaults", () => {
    writeFileSync(configPath, JSON.stringify({ themes: { night: "dracula" } }), "utf8");
    const settings = store.get();
    assert.equal(settings.themes.night, "dracula");
    assert.equal(settings.themes.day, "day"); // untouched slot keeps its default
  });

  it("sanitizes themes per slot: invalid assignments fall back individually", () => {
    writeFileSync(
      configPath,
      JSON.stringify({ themes: { day: 42, night: "dracula" } }),
      "utf8",
    );
    const settings = store.get();
    assert.equal(settings.themes.day, "day"); // invalid → default
    assert.equal(settings.themes.night, "dracula"); // valid sibling survives
  });

  it("keeps a corrupt JSON file on disk and runs on in-memory defaults", () => {
    writeFileSync(configPath, "{ not json", "utf8");
    const settings = store.get();
    assert.equal(settings.enabled, true);
    assert.equal(settings.latitude, 50.0755);
    // The user's file is never overwritten — it stays for manual repair.
    assert.equal(readFileSync(configPath, "utf8"), "{ not json");
  });

  it("writes atomically: no tmp file is left behind after save", () => {
    writeFileSync(configPath, JSON.stringify({ enabled: true }), "utf8");
    store.save({ lang: "cs" });
    assert.equal(existsSync(`${configPath}.tmp`), false);
    assert.equal(readDisk().lang, "cs");
  });
});
