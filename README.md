---
project:
  name: "time-theme-switcher"
  description: "Solar-elevation-based Pi theme rotation (dawn/day/dusk/night) for the pi coding agent, with the palettes bundled."
  language: "TypeScript"
  category: ""
  framework: ""
  packageManager: "npm"
  status: "production"
  quality: "stable"
  context: "personal"
  progress: "completed"
analysis:
  hasGit: true
  hasReadme: true
  mainFiles: ["index.ts"]
  entryPoints: ["index.ts"]
  configFiles: ["package.json","tsconfig.json"]
  testFiles: ["test\\commands.test.ts","test\\herdr-controller.test.ts","test\\herdr-toml.test.ts","test\\herdr.test.ts","test\\i18n.test.ts","test\\register-jiti.mjs","test\\settings.test.ts","test\\switcher.test.ts","test\\terminal.test.ts","test\\themes.test.ts"]
  testFileCount: 10
  dependencies: []
  devDependencies: ["@types/node","smol-toml","typescript"]
  scripts: {"test":"node --import ./test/register-jiti.mjs --test test/*.test.ts","typecheck":"tsc -p tsconfig.json","themes:verify":"node test/verify-themes.mjs"}
generator:
  tool: "pi-readme-generator"
  version: "0.5.0"
  timestamp: "2026-10-27T07:34:09.454Z"
---


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
registered in Pi, or one of the plugin's bundled palettes (see below). The
theme is applied via `ctx.ui.setTheme()`.

## Bundled themes

The palettes above ship **inside the package** (`themes/*.json`, listed in
`files[]`) — but as **private data**, not registered themes. They are NOT
declared under `pi.themes`, so Pi never loads them: installing the plugin
brings **zero themes into Pi's theme registry**. Nothing appears in Pi's own
theme pickers, `/settings`, and nothing can collide with themes in
`~/.pi/agent/themes/` or `.pi/themes/`.

The plugin builds its palettes as in-memory theme instances at runtime
(`src/shared/palettes.ts`) and applies them via `ui.setTheme(instance)`, which
bypasses the name registry entirely. From your point of view the rotation
still works out of the box — install and go, no theme files to copy.

Five palettes ship: the four slot themes (`tts-dawn`, `tts-day`, `tts-dusk`,
`tts-night`) plus `tts-osaka-jade`, the night-slot default. `tts-night` is
bundled but not assigned by default — pick it for any slot if you prefer a
warm dark night over Osaka Jade.

Every palette carries a `tts-` prefix (`tts-dawn`, `tts-day`, `tts-dusk`,
`tts-night`, `tts-osaka-jade`). This keeps the plugin's assignments visually
distinct from your own same-named themes in the picker.

What this means for you:

- Your theme setup is untouched: the plugin registers nothing and overwrites
  nothing. Your themes in `~/.pi/agent/themes/` and `.pi/themes/` keep full
  precedence, always.
- A slot still accepts **any** theme registered in Pi — user or built-in.
  Pick a different theme per slot in `/theme-switcher` or by editing the
  config; the bundled palettes are only the defaults.
- Want a bundled palette as a real registered theme under your own name? Copy
  the JSON out of `themes/` into `~/.pi/agent/themes/<your-name>.json`, change
  its `name` field, and assign it. It is a plain Pi theme file — no
  plugin-specific fields — so it works standalone in any Pi install.

`npm run themes:verify` checks all five files (valid JSON, matching `name`,
required color keys, resolvable color vars, every slot default reachable).

## Commands

- `/theme-switcher` — opens the settings screen (interactive TUI): master
  On/Off toggle, latitude/longitude/timezone, per-slot theme assignment, UI
  language, and the current slot. Each slot row opens a picker over the
  bundled palettes plus every theme registered in Pi; the recommended default
  is tagged **(Default)**.
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
  },
  "syncTerminalBg": true,
  "syncTerminalFg": true,
  "syncHerdrTheme": true
}
```

- `enabled` — master switch; when `false` no theme is applied
- `syncTerminalBg` — when `true` (default), synchronizes the host terminal
  background color via OSC 11 (`\x1b]11;#RRGGBB\x07`) to match the active
  theme, and restores default background with OSC 111 on exit/stop. Compatible
  with Windows Terminal, WezTerm, Alacritty, Ghostty, Kitty, iTerm2, etc.
  *Note:* Under Herdr multiplexer, OSC 10/11 sequences only change the Pi pane's
  emulated terminal and do not reach the host terminal (e.g. Windows Terminal).
- `syncTerminalFg` — when `true` (default), synchronizes the host terminal
  foreground / text color via OSC 10 (`\x1b]10;#RRGGBB\x07`) to match the
  active theme, and restores default text color with OSC 110 on exit/stop.
- `syncHerdrTheme` — when `true` (default), synchronizes the theme in the Herdr
  multiplexer configuration (`%APPDATA%\herdr\config.toml` on Windows,
  `~/.config/herdr/config.toml` on Linux and macOS, or `HERDR_CONFIG_PATH`) to match
  the active circadian phase (`solarized-light`, `gruvbox`, `catppuccin`, `rose-pine`),
  notifying the running Herdr server via `herdr server reload-config`.
  - Sets `[theme.custom] sidebar_bg = "#hex"` to match the background color of the
    active Pi theme. By default, Herdr sidebars without `theme.custom.sidebar_bg` use
    the host terminal's background; setting this ensures the sidebar recolors cleanly
    during light themes instead of staying dark. *Note:* The plugin overwrites any
    manual `theme.custom.sidebar_bg`, and after disabling sync in the plugin config,
    the last written value remains in `config.toml`.
  - Always reloads a running Herdr server via `herdr server reload-config` after config
    changes (even when running outside Herdr; if the CLI or server is absent, it is
    silently ignored).
  - Resolves the Herdr binary from `HERDR_BIN_PATH`, falling back to standard `PATH` search.
  - Supports light counterparts (`gruvbox-light`, `catppuccin-latte`, `solarized-light`,
    `tokyo-night-day`, `rose-pine-dawn`, `kanagawa-lotus`, `one-light`).
  - Sets `auto_switch = false` in `[theme]` (or `theme.auto_switch = false`) and
    notifies/logs once when doing so, because Herdr's built-in `auto_switch` toggles
    `dark_name`/`light_name` based solely on terminal appearance, which would override
    and conflict with the 4-phase circadian rotation.
  - Safely parses TOML config: preserves existing keybindings (`[[keys.command]]`),
    table sections, and inline or dotted keys without emitting duplicate table definitions.
  - For remote sessions (`herdr --remote`), Herdr themes are rendered by the local client,
    so settings apply to the local configuration where the client runs.
- `latitude` / `longitude` — your location (-90..90 / -180..180)
- `timezone` — IANA name, informational
- `lang` — UI language of the plugin (`en` or `cs`)
- `themes` — theme name per slot (`dawn`/`day`/`dusk`/`night`); assign any
  theme registered in Pi, or one of the bundled palettes (`tts-…`, see
  [Bundled themes](#bundled-themes)). The shipped values are the bundled
  palettes. Configs written by earlier versions keep their own theme names —
  they keep working as long as those themes are still registered in Pi (or
  match a bundled palette name), and a slot whose theme is missing reports the
  usual "could not apply" notice until you re-assign it.

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
- `src/slices/switcher/` — rotation timer, settings screen, slash commands,
  terminal background sync, and Herdr multiplexer sync (`controller.ts`,
  `settings-ui.ts`, `commands.ts`, `terminal.ts`, `herdr.ts`, `herdr-toml.ts`)
- `src/shared/` — solar math, settings shape, i18n string table (en + cs)
- `themes/` — the palettes shipped with the package (`tts-*.json`)
- `test/` — node:test suites for i18n, settings, the controller and the
  packaged themes
