# time-theme-switcher

Time-of-day theme rotation for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent), inspired by f.lux: rotation determines **when** to show a theme, not color temperature inside it. Themes are fixed palettes, never altered by time.

## How it works

At `session_start` (and every 60 s thereafter) the extension computes the solar
elevation for your location and maps it to a slot:

| Slot  | Solar elevation      | Default theme    | Palette                    |
|-------|----------------------|------------------|----------------------------|
| day   | > -0.833°            | `tts-day`        | Solarized Light            |
| dawn  | > -6°                | `tts-dawn`       | Gruvbox Material Soft Dark |
| dusk  | > -12°               | `tts-dusk`       | Catppuccin Macchiato       |
| night | otherwise            | `tts-osaka-jade` | Osaka Jade                 |

The slot→theme assignment is configurable: each slot can use any theme
registered in Pi (see below). The theme is applied via `ctx.ui.setTheme()`.

## Bundled themes

The palettes above ship **inside the package** (`themes/*.json`, declared under
`pi.themes` in `package.json`), so `pi install` gives you a working rotation
with no extra setup — no theme files to copy, no picker round-trip. Pi resolves
package themes automatically once the package is installed.

Five palettes ship: the four slot themes (`tts-dawn`, `tts-day`, `tts-dusk`,
`tts-night`) plus `tts-osaka-jade`, the night-slot default. `tts-night` is
bundled but not assigned by default — pick it for any slot if you prefer a
warm dark night over Osaka Jade.

Every packaged theme carries a `tts-` prefix (`tts-dawn`, `tts-day`,
`tts-dusk`, `tts-night`, `tts-osaka-jade`). This is deliberate: user theme
directories (`~/.pi/agent/themes/`, `.pi/themes/`) are scanned **before**
package resources and win on name collisions. Shipping plain `dawn`/`day`
names would collide with the same-named files those directories already hold,
so the prefixed copies stay reachable while your own themes keep precedence.

Because the names are prefixed, nothing in your existing setup changes:

- A slot still accepts **any** theme registered in Pi — bundled, user, or
  built-in. Pick a different theme per slot in `/theme-switcher` or by editing
  the config; the packaged themes are only the defaults.
- Want the packaged palette under a name of your own? Copy the JSON out of
  `themes/` into `~/.pi/agent/themes/<your-name>.json`, change its `name`
  field, and assign it. Your copy outranks the bundled one.
- The palettes are plain Pi theme files — no plugin-specific fields — so they
  also work standalone in any Pi install.

`npm run themes:verify` checks all five files (valid JSON, matching `name`,
required color keys, resolvable color vars, every slot default reachable).

## Commands

- `/theme-switcher` — opens the settings screen (interactive TUI): master
  On/Off toggle, latitude/longitude/timezone, per-slot theme assignment, UI
  language, and the current slot. Each slot row opens a picker over every
  theme registered in Pi; the recommended default is tagged **(Default)**.
  Subcommands work without the UI:
  - `/theme-switcher on` / `/theme-switcher off` — enable/disable rotation
  - `/theme-switcher status` — show state, current slot and coordinates
  - `/theme-switcher lang en|cs` — switch the plugin's UI language

When rotation is switched off, the theme that was active before the rotation
took over is restored.

## Configuration

Global config lives at `~/.pi/agent/time-theme-switcher.json` (created with
defaults on first run):

```json
{
  "enabled": true,
  "latitude": 50.0755,
  "longitude": 14.4378,
  "timezone": "Europe/Prague",
  "lang": "en",
  "themes": {
    "dawn": "tts-dawn",
    "day": "tts-day",
    "dusk": "tts-dusk",
    "night": "tts-osaka-jade"
  }
}
```

- `enabled` — master switch; when `false` no theme is applied
- `latitude` / `longitude` — your location (-90..90 / -180..180)
- `timezone` — IANA name, informational
- `lang` — UI language of the plugin (`en` or `cs`)
- `themes` — Pi theme name per slot (`dawn`/`day`/`dusk`/`night`); assign any
  theme registered in Pi. The shipped values are the bundled palettes (see
  [Bundled themes](#bundled-themes)). Configs written by earlier versions keep
  their own theme names — they keep working as long as those themes are still
  registered in Pi, and a slot whose theme is missing reports the usual
  "could not apply" notice until you re-assign it.

Storage mechanics (schema-driven, see `src/slices/settings/index.ts`):

- **Per-field validation** — each key falls back to its own default
  individually; a corrupt value never resets valid sibling settings.
- **Self-healing loads** — after a plugin upgrade adds or renames keys, the
  next load rewrites the file with the full current schema.
- **Corrupt JSON is preserved** — an unparseable file is never overwritten;
  the plugin runs on in-memory defaults and logs to stderr.
- **Atomic writes** — saves go through a tmp file + rename, so a crash
  mid-write cannot truncate the config.

## Development

```sh
npm test           # unit tests, including the packaged-theme guard
npm run themes:verify   # standalone check of themes/*.json
```

Tests run through `node --test` with jiti as the TS loader (dev-only, via
`test/register-jiti.mjs`), because Arch/Manjaro Node builds ship without type
stripping. Set `TTS_JITI=/path/to/jiti-register.mjs` if your jiti lives
elsewhere.

## Layout

- `index.ts` — thin composition root (lifecycle, subagent guard)
- `src/slices/rotation/` — solar elevation → theme slot mapping
- `src/slices/settings/` — global config loading/persistence
- `src/slices/switcher/` — rotation timer, settings screen, slash commands
  (`controller.ts`, `settings-ui.ts`, `commands.ts`)
- `src/shared/` — solar math, settings shape, i18n string table (en + cs)
- `themes/` — the palettes shipped with the package (`tts-*.json`)
- `test/` — node:test suites for i18n, settings, the controller and the
  packaged themes
