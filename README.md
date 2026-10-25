# time-theme-switcher

Time-of-day theme rotation for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent), inspired by f.lux: rotation determines **when** to show a theme, not color temperature inside it. Themes are fixed palettes, never altered by time.

## How it works

At `session_start` (and every 60 s thereafter) the extension computes the solar
elevation for your location and maps it to a slot:

| Slot  | Solar elevation      | Default theme | Palette                    |
|-------|----------------------|---------------|----------------------------|
| day   | > -0.833°            | `day`         | Solarized Light            |
| dawn  | > -6°                | `dawn`        | Gruvbox Material Soft Dark |
| dusk  | > -12°               | `dusk`        | Catppuccin Macchiato       |
| night | otherwise            | `osaka-jade`  | Osaka Jade                 |

The slot→theme assignment is configurable: each slot can use any theme
registered in Pi (see below). The theme is applied via `ctx.ui.setTheme()`.

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
    "dawn": "dawn",
    "day": "day",
    "dusk": "dusk",
    "night": "osaka-jade"
  }
}
```

- `enabled` — master switch; when `false` no theme is applied
- `latitude` / `longitude` — your location (-90..90 / -180..180)
- `timezone` — IANA name, informational
- `lang` — UI language of the plugin (`en` or `cs`)
- `themes` — Pi theme name per slot (`dawn`/`day`/`dusk`/`night`); assign any
  theme registered in Pi. The shipped values are the recommended defaults.

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
npm test
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
- `test/` — node:test suites for i18n, settings and the controller
