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

## Configuration

Global config lives at `~/.pi/agent/time-theme-switcher.json` (created with
defaults on first run):

```json
{
  "latitude": 50.0755,
  "longitude": 14.4378,
  "timezone": "Europe/Prague"
}
```

Edit the coordinates to your location; invalid or missing files fall back to
the Prague defaults.

## Layout

- `index.ts` — thin composition root (lifecycle, subagent guard)
- `src/slices/rotation/` — solar elevation → theme slot mapping
- `src/slices/settings/` — global config loading
- `src/shared/solar.ts` — NOAA/f.lux solar math
