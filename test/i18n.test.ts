/** i18n tests: locale completeness and normalizeLocale fallback behaviour. */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LOCALES, normalizeLocale, stringsFor } from "../src/shared/i18n.ts";

describe("locale completeness", () => {
  it("every locale exposes exactly the same string keys", () => {
    const reference = Object.keys(stringsFor(LOCALES[0])).sort();
    for (const locale of LOCALES) {
      assert.deepEqual(Object.keys(stringsFor(locale)).sort(), reference);
    }
  });

  it("no string value is empty in any locale", () => {
    for (const locale of LOCALES) {
      const strings = stringsFor(locale) as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(strings)) {
        if (typeof value === "string") {
          assert.ok(value.trim().length > 0, `${locale}.${key} is empty`);
        }
      }
    }
  });

  it("function-valued strings return non-empty text in every locale", () => {
    const samples: Record<string, unknown[]> = {
      switchedTo: ["Day"],
      restoredTheme: ["solarized-light"],
      langSet: ["en"],
      langUnknown: ["xx"],
      statusText: ["on", "Day", 50.0755, 14.4378],
    };
    for (const locale of LOCALES) {
      const strings = stringsFor(locale) as unknown as Record<
        string,
        (...args: never[]) => string
      >;
      for (const [key, args] of Object.entries(samples)) {
        assert.equal(typeof strings[key], "function", `${locale}.${key} missing`);
        assert.ok(strings[key](...(args as never[])).length > 0, `${locale}.${key} empty`);
      }
    }
  });
});

describe("normalizeLocale", () => {
  it("accepts cs aliases case-insensitively", () => {
    for (const raw of ["cs", "CS", "Cz", "cze", " cs "]) {
      assert.equal(normalizeLocale(raw), "cs");
    }
  });

  it("falls back to en for anything else", () => {
    for (const raw of ["en", "de", "", "xx", undefined]) {
      assert.equal(normalizeLocale(raw), "en");
    }
  });
});
