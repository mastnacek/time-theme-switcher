/**
 * Rotation tests: twilight is split by the sun's direction, so a morning
 * runs night → dawn → day and an evening day → dusk → night, never the
 * reverse (the old depth-based split put "dusk" before "dawn" every morning).
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getThemeForTime, themeForElevation } from "../src/slices/rotation/index.ts";

const PRAGUE = { lat: 50.0755, lon: 14.4378 };

/** Slot sequence over one day in 1-minute steps, consecutive duplicates collapsed. */
function daySequence(isoDay: string): string[] {
  const start = new Date(`${isoDay}T00:00:00Z`).getTime();
  const seq: string[] = [];
  for (let minute = 0; minute < 24 * 60; minute++) {
    const slot = getThemeForTime(new Date(start + minute * 60_000), PRAGUE.lat, PRAGUE.lon);
    if (seq.at(-1) !== slot) seq.push(slot);
  }
  return seq;
}

describe("themeForElevation", () => {
  it("splits twilight by direction, not by depth", () => {
    assert.equal(themeForElevation(10, true), "day");
    assert.equal(themeForElevation(-3, true), "dawn");
    assert.equal(themeForElevation(-9, true), "dawn");
    assert.equal(themeForElevation(-3, false), "dusk");
    assert.equal(themeForElevation(-9, false), "dusk");
    assert.equal(themeForElevation(-15, true), "night");
    assert.equal(themeForElevation(-15, false), "night");
  });
});

describe("getThemeForTime", () => {
  for (const day of ["2026-10-27", "2026-12-21", "2026-06-21"]) {
    it(`runs night → dawn → day → dusk → night in Prague on ${day}`, () => {
      assert.deepEqual(daySequence(day), ["night", "dawn", "day", "dusk", "night"]);
    });
  }

  it("gives dawn and dusk one continuous span of about 70 minutes in late October", () => {
    const start = new Date("2026-10-27T00:00:00Z").getTime();
    const minutes = { dawn: 0, dusk: 0 } as Record<string, number>;
    for (let minute = 0; minute < 24 * 60; minute++) {
      const slot = getThemeForTime(new Date(start + minute * 60_000), PRAGUE.lat, PRAGUE.lon);
      if (slot in minutes) minutes[slot]++;
    }
    for (const slot of ["dawn", "dusk"]) {
      assert.ok(minutes[slot] >= 60 && minutes[slot] <= 85, `${slot}: ${minutes[slot]} min`);
    }
  });
});
