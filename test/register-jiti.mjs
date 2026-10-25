/**
 * Dev-only TS loader for `npm test` (not shipped in the package).
 * Arch/Manjaro Node builds lack type stripping ("not compiled with
 * TypeScript support"), so node --test cannot load .ts sources directly.
 * This registers jiti — the same loader pi itself uses for extensions —
 * before the test runner starts. Resolution order:
 *   1. TTS_JITI env var (path to jiti-register.mjs)
 *   2. bare "jiti/register" (when jiti is installed as a devDependency)
 *   3. the host pi installation's bundled jiti
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

if (process.env.TTS_JITI && existsSync(process.env.TTS_JITI)) {
  await import(pathToFileURL(process.env.TTS_JITI).href);
} else {
  try {
    await import("jiti/register");
  } catch {
    const bundled = join(
      homedir(),
      ".pi",
      "agent",
      "npm",
      "node_modules",
      "jiti",
      "lib",
      "jiti-register.mjs",
    );
    if (!existsSync(bundled)) {
      throw new Error(
        "jiti not found — install it (npm i -D jiti) or point TTS_JITI at jiti-register.mjs",
      );
    }
    await import(pathToFileURL(bundled).href);
  }
}
