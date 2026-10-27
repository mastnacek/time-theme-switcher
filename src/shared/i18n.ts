/**
 * Shared kernel: UI string table (pi-plugin-dev §10).
 * Text the user reads comes from here; keyed by the persisted `lang` setting.
 * Add a locale by extending LOCALES and adding a complete row to STRINGS.
 */

export const LOCALES = ["en", "cs"] as const;
export type Locale = (typeof LOCALES)[number];

export interface SwitcherStrings {
  // Command descriptions (completion-menu copy)
  cmdDescription: string;
  // Generic tokens
  on: string;
  off: string;
  activeMarker: string;
  // Notifications
  switchedTo: (label: string) => string;
  themeApplyFailed: (name: string) => string;
  restoredTheme: (name: string) => string;
  rotationDisabled: string;
  tuiOnly: string;
  usage: string;
  langSet: (lang: string) => string;
  langUnknown: (code: string) => string;
  statusText: (state: string, slotLabel: string, latitude: number, longitude: number) => string;
  // Settings screen
  settingsTitle: string;
  enabledLabel: string;
  enabledDesc: string;
  syncTerminalBgLabel: string;
  syncTerminalBgDesc: string;
  syncTerminalFgLabel: string;
  syncTerminalFgDesc: string;
  syncHerdrThemeLabel: string;
  syncHerdrThemeDesc: string;
  latitudeLabel: string;
  latitudeDesc: string;
  longitudeLabel: string;
  longitudeDesc: string;
  timezoneLabel: string;
  timezoneDesc: string;
  languageLabel: string;
  languageDesc: string;
  slotLabel: string;
  slotDesc: string;
  // Per-slot theme assignment
  slotNames: { dawn: string; day: string; dusk: string; night: string };
  themeRowLabel: (slotLabel: string) => string;
  themeRowDesc: (defaultName: string) => string;
  defaultTag: string;
  pickerTitle: (slotLabel: string) => string;
  pickerHint: string;
  invalidTheme: (name: string) => string;
  editHint: string;
  invalidLatitude: string;
  invalidLongitude: string;
  invalidTimezone: string;
  // Completion descriptions
  compOn: string;
  compOff: string;
  compStatus: string;
  compRefresh: string;
  compLang: string;
  compLangEn: string;
  compLangCs: string;
  refreshed: (slotLabel: string, theme: string) => string;
}

const STRINGS: Record<Locale, SwitcherStrings> = {
  en: {
    cmdDescription: "Time-based theme rotation: settings, on/off, status, refresh",
    on: "on",
    off: "off",
    activeMarker: " · ● ACTIVE",
    switchedTo: (label) => `Theme switched to ${label}`,
    themeApplyFailed: (name) =>
      `Could not apply theme "${name}" — is it still registered in Pi?`,
    restoredTheme: (name) => `Theme rotation off — restored ${name}`,
    rotationDisabled: "Theme rotation off",
    tuiOnly: "The settings screen requires interactive TUI mode",
    usage: "Usage: /theme-switcher [on|off|status|refresh|lang <code>]",
    langSet: (lang) => `Language set to ${lang}`,
    langUnknown: (code) => `Unknown language "${code}" (available: en, cs)`,
    refreshed: (slotLabel, theme) => `Theme refreshed · slot ${slotLabel} (${theme})`,
    statusText: (state, slotLabel, latitude, longitude) =>
      `Rotation ${state} · slot ${slotLabel} · ${latitude}, ${longitude}`,
    settingsTitle: "Theme Switcher Settings",
    enabledLabel: "Rotation",
    enabledDesc: "Master switch: determine the active theme from solar elevation",
    syncTerminalBgLabel: "Terminal background",
    syncTerminalBgDesc: "Synchronize host terminal background with active theme (OSC 11)",
    syncTerminalFgLabel: "Terminal text color",
    syncTerminalFgDesc: "Synchronize host terminal text/font color with active theme (OSC 10)",
    syncHerdrThemeLabel: "Herdr multiplexer theme",
    syncHerdrThemeDesc: "Synchronize Herdr theme in config.toml and reload live",
    latitudeLabel: "Latitude",
    latitudeDesc: "Geographic latitude (-90 to 90), e.g. 50.0755 for Prague",
    longitudeLabel: "Longitude",
    longitudeDesc: "Geographic longitude (-180 to 180), e.g. 14.4378 for Prague",
    timezoneLabel: "Timezone",
    timezoneDesc: "IANA timezone name, informational (e.g. Europe/Prague)",
    languageLabel: "Language",
    languageDesc: "UI language of this plugin",
    slotLabel: "Current slot",
    slotDesc: "Theme slot derived from the current solar elevation (read-only)",
    slotNames: { dawn: "Dawn", day: "Day", dusk: "Dusk", night: "Night" },
    themeRowLabel: (slotLabel) => `${slotLabel} theme`,
    themeRowDesc: (defaultName) => `Recommended default: ${defaultName}`,
    defaultTag: "(Default)",
    pickerTitle: (slotLabel) => `Theme for ${slotLabel}`,
    pickerHint: "↑↓ navigate · Enter select · Esc cancel",
    invalidTheme: (name) => `Unknown theme "${name}" — keeping the previous value`,
    editHint: "Enter confirms · Esc cancels",
    invalidLatitude: "Invalid latitude — keeping the previous value",
    invalidLongitude: "Invalid longitude — keeping the previous value",
    invalidTimezone: "Timezone must not be empty — keeping the previous value",
    compOn: "Enable theme rotation",
    compOff: "Disable theme rotation",
    compStatus: "Show current rotation status",
    compRefresh: "Force refresh theme, terminal colors & Herdr sync",
    compLang: "Set UI language (en | cs)",
    compLangEn: "English",
    compLangCs: "Czech (Česky)",
  },
  cs: {
    cmdDescription: "Časová rotace témat: nastavení, zap/vyp, stav, obnovení",
    on: "on",
    off: "off",
    activeMarker: " · ● AKTIVNÍ",
    switchedTo: (label) => `Téma přepnuto na ${label}`,
    themeApplyFailed: (name) =>
      `Téma "${name}" se nepodařilo použít — je stále registrované v Pi?`,
    restoredTheme: (name) => `Rotace témat vypnuta — obnoveno ${name}`,
    rotationDisabled: "Rotace témat vypnuta",
    tuiOnly: "Obrazovka nastavení vyžaduje interaktivní režim TUI",
    usage: "Použití: /theme-switcher [on|off|status|refresh|lang <kód>]",
    langSet: (lang) => `Jazyk nastaven na ${lang}`,
    langUnknown: (code) => `Neznámý jazyk "${code}" (dostupné: en, cs)`,
    refreshed: (slotLabel, theme) => `Motiv obnoven · slot ${slotLabel} (${theme})`,
    statusText: (state, slotLabel, latitude, longitude) =>
      `Rotace ${state} · slot ${slotLabel} · ${latitude}, ${longitude}`,
    settingsTitle: "Nastavení přepínače témat",
    enabledLabel: "Rotace",
    enabledDesc: "Hlavní vypínač: aktivní téma podle výšky Slunce",
    syncTerminalBgLabel: "Pozadí terminálu",
    syncTerminalBgDesc: "Synchronizovat barvu pozadí terminálu s aktivním tématem (OSC 11)",
    syncTerminalFgLabel: "Barva textu terminálu",
    syncTerminalFgDesc: "Synchronizovat barvu písma/textu terminálu s aktivním tématem (OSC 10)",
    syncHerdrThemeLabel: "Motiv Herdru",
    syncHerdrThemeDesc: "Synchronizovat motiv multiplexeru Herdr v config.toml a aplikovat za běhu",
    latitudeLabel: "Zeměpisná šířka",
    latitudeDesc: "Zeměpisná šířka (-90 až 90), např. 50.0755 pro Prahu",
    longitudeLabel: "Zeměpisná délka",
    longitudeDesc: "Zeměpisná délka (-180 až 180), např. 14.4378 pro Prahu",
    timezoneLabel: "Časové pásmo",
    timezoneDesc: "Název IANA pásma, informativní (např. Europe/Prague)",
    languageLabel: "Jazyk",
    languageDesc: "Jazyk uživatelského rozhraní tohoto pluginu",
    slotLabel: "Aktuální slot",
    slotDesc: "Slot tématu odvozený z aktuální výšky Slunce (jen ke čtení)",
    slotNames: { dawn: "Svítání", day: "Den", dusk: "Soumrak", night: "Noc" },
    themeRowLabel: (slotLabel) => `Téma: ${slotLabel}`,
    themeRowDesc: (defaultName) => `Doporučená výchozí hodnota: ${defaultName}`,
    defaultTag: "(Výchozí)",
    pickerTitle: (slotLabel) => `Téma pro: ${slotLabel}`,
    pickerHint: "↑↓ pohyb · Enter potvrdí · Esc zruší",
    invalidTheme: (name) => `Neznámé téma "${name}" — ponechávám původní hodnotu`,
    editHint: "Enter potvrdí · Esc zruší",
    invalidLatitude: "Neplatná zeměpisná šířka — ponechávám původní hodnotu",
    invalidLongitude: "Neplatná zeměpisná délka — ponechávám původní hodnotu",
    invalidTimezone: "Časové pásmo nesmí být prázdné — ponechávám původní hodnotu",
    compOn: "Zapnout rotaci témat",
    compOff: "Vypnout rotaci témat",
    compStatus: "Zobrazit aktuální stav rotace",
    compRefresh: "Vynutit obnovení motivu, barev terminálu a Herdru",
    compLang: "Nastavit jazyk rozhraní (en | cs)",
    compLangEn: "Angličtina (English)",
    compLangCs: "Čeština",
  },
};

/** A typo is English, never a crash. */
export function normalizeLocale(raw: string | undefined): Locale {
  const token = (raw ?? "").trim().toLowerCase();
  if (token === "cs" || token === "cz" || token === "cze") return "cs";
  return "en";
}

export function stringsFor(locale: string | undefined): SwitcherStrings {
  return STRINGS[normalizeLocale(locale)];
}
