import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { t, type Locale, type MessageKey } from "./i18n";

export type Theme = "light" | "dark" | "system";

const LOCALE_KEY = "ogc-locale";
const THEME_KEY = "ogc-theme";
const REF_MODEL_KEY = "ogc-ref-model";

function readRefModel(): string {
  return localStorage.getItem(REF_MODEL_KEY) ?? "";
}

function readLocale(): Locale {
  const raw = localStorage.getItem(LOCALE_KEY);
  if (
    raw === "en" ||
    raw === "zh-CN" ||
    raw === "zh-TW" ||
    raw === "ja" ||
    raw === "es" ||
    raw === "de" ||
    raw === "ru" ||
    raw === "fr" ||
    raw === "pt" ||
    raw === "tr" ||
    raw === "it"
  ) {
    return raw;
  }
  return "zh-CN";
}

function readTheme(): Theme {
  const raw = localStorage.getItem(THEME_KEY);
  if (raw === "light" || raw === "dark" || raw === "system") return raw;
  return "system";
}

function systemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

interface Prefs {
  locale: Locale;
  theme: Theme;
  refModel: string;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: Theme) => void;
  setRefModel: (model: string) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const PrefsContext = createContext<Prefs | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale);
  const [theme, setThemeState] = useState<Theme>(readTheme);
  const [refModel, setRefModelState] = useState<string>(readRefModel);

  useEffect(() => {
    applyTheme(theme);
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = t(locale, "title");
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    localStorage.setItem(LOCALE_KEY, next);
    setLocaleState(next);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(THEME_KEY, next);
    setThemeState(next);
  }, []);

  const setRefModel = useCallback((next: string) => {
    localStorage.setItem(REF_MODEL_KEY, next);
    setRefModelState(next);
  }, []);

  const translate = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) =>
      t(locale, key, vars),
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      theme,
      refModel,
      setLocale,
      setTheme,
      setRefModel,
      t: translate,
    }),
    [locale, theme, refModel, setLocale, setTheme, setRefModel, translate]
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Prefs {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error("usePrefs must be used within PrefsProvider");
  return ctx;
}
