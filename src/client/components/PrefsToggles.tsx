import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { LOCALES } from "../lib/i18n";
import { usePrefs, type Theme } from "../lib/prefs";

const THEMES: Theme[] = ["light", "dark", "system"];

export default function PrefsToggles() {
  const { locale, setLocale, theme, setTheme, t } = usePrefs();

  function cycleTheme() {
    const i = THEMES.indexOf(theme);
    setTheme(THEMES[(i + 1) % THEMES.length]);
  }

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Desktop;
  const themeLabel =
    theme === "light"
      ? t("themeLight")
      : theme === "dark"
        ? t("themeDark")
        : t("themeSystem");

  return (
    <div className="flex items-center gap-1.5">
      <label className="sr-only" htmlFor="ogc-lang">
        {t("lang")}
      </label>
      <select
        id="ogc-lang"
        value={locale}
        onChange={(e) => setLocale(e.target.value as typeof locale)}
        className="h-8 rounded-md border border-kumo-line bg-kumo-elevated px-2 text-xs text-kumo-default"
        aria-label={t("lang")}
      >
        {LOCALES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={cycleTheme}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-kumo-line bg-kumo-elevated text-kumo-default"
        aria-label={`${t("theme")}: ${themeLabel}`}
        title={themeLabel}
      >
        <ThemeIcon size={16} />
      </button>
    </div>
  );
}
