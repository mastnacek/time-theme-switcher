# time-theme-switcher

Time-of-day theme rotation for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent), inspired by f.lux: rotation determines **when** to show a theme, not color temperature inside it. Themes are fixed palettes, never altered by time.

## How it works

At `session_start` (and every 60 s thereafter) the extension computes the solar
elevation for your location and maps it to a slot:

| Slot  | Solar elevation      | Theme file    | Palette                    |
|-------|----------------------|---------------|----------------------------|
| day   | > -0.833°            | `day`         | Solarized Light            |
| dawn  | > -6°                | `dawn`        | Gruvbox Material Soft Dark |
| dusk  | > -12°               | `dusk`        | Catppuccin Macchiato       |
| night | otherwise            | `osaka-jade`  | Osaka Jade                 |

The theme is applied via `ctx.ui.setTheme()`. The referenced theme JSON files
must exist in `~/.pi/agent/themes/`.

## Commands

- `/theme-switcher` — opens the settings screen (interactive TUI): master
  On/Off toggle, latitude/longitude/timezone, UI language, and the current
  slot. Subcommands work without the UI:
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
  "lang": "en"
}
```

- `enabled` — master switch; when `false` no theme is applied
- `latitude` / `longitude` — your location (-90..90 / -180..180)
- `timezone` — IANA name, informational
- `lang` — UI language of the plugin (`en` or `cs`)

Invalid or missing files fall back to the Prague defaults; older configs
without `enabled`/`lang` keep working (both default to on/English).

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
