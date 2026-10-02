import { en, type MessageKey } from './locales/en';
import { de } from './locales/de';

/**
 * On-screen text in the learner's language. Every string the app shows lives
 * in a locale file (src/locales); code asks for it by key with `t`, filling in
 * `{name}` placeholders. The app language is separate from the practice
 * language: a German speaker can practise English drills with German menus.
 */
export type UiLang = 'en' | 'de';
export type { MessageKey };

export const UI_LANGS: readonly UiLang[] = ['en', 'de'];
const MESSAGES: Record<UiLang, Record<MessageKey, string>> = { en, de };

let current: UiLang = 'en';

export function setUiLanguage(lang: UiLang): void {
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

export function uiLanguage(): UiLang {
  return current;
}

/** The first browser language the app has text for, else English. */
export function browserUiLanguage(locales: readonly string[]): UiLang {
  for (const l of locales) {
    const base = l.toLowerCase().split('-')[0];
    if ((UI_LANGS as readonly string[]).includes(base)) return base as UiLang;
  }
  return 'en';
}

/** Whether `key` names a message, for keys built from data such as layout ids. */
export function hasMessage(key: string): key is MessageKey {
  return key in en;
}

/** The text for `key` in the app language, with `{name}` replaced by `params.name`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const text = MESSAGES[current][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** A 0–1 fraction as a percentage in the app language: "96.5%", "96,5 %". */
export function percent(x: number, digits = 0): string {
  return new Intl.NumberFormat(current, {
    style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits,
  }).format(x);
}

/** A number with a fixed count of decimals in the app language: "4.5", "4,5". */
export function decimal(x: number, digits = 1): string {
  return new Intl.NumberFormat(current, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x);
}

/** `one` when n is 1, else `other`; both keys get `{n}`. */
export function plural(n: number, one: MessageKey, other: MessageKey, params: Record<string, string | number> = {}): string {
  return t(n === 1 ? one : other, { n, ...params });
}

/**
 * Fills static markup: `data-i18n` sets the text, `data-i18n-title` and
 * `data-i18n-aria-label` set those attributes.
 */
export function applyStatic(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach((e) => {
    e.textContent = t(e.dataset.i18n as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-title]').forEach((e) => {
    e.title = t(e.dataset.i18nTitle as MessageKey);
  });
  root.querySelectorAll<HTMLElement>('[data-i18n-aria-label]').forEach((e) => {
    e.setAttribute('aria-label', t(e.dataset.i18nAriaLabel as MessageKey));
  });
}
