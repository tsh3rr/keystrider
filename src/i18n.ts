import { en, type Message } from './locales/en';
import { de } from './locales/de';

/**
 * Interface text in the learner's language. Every string on screen comes from
 * a locale file (src/locales/<lang>.ts) by key: `t('result.done', { name })`.
 *
 * English is the source: its keys define what every other locale must have,
 * so a missing German string is a type error, not a blank on screen.
 * Placeholders are `{name}`; a message that depends on a count is an object
 * of plural forms (`one`, `other`) picked with the `n` parameter.
 *
 * Static text in index.html carries `data-i18n` (text), `data-i18n-title`,
 * `data-i18n-aria-label` or `data-i18n-placeholder` attributes naming a key;
 * `applyTranslations` fills them in.
 *
 * The interface language is separate from the practice language: you can
 * practise English with German menus.
 */

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, Message>;
export type Params = Record<string, string | number>;

const LOCALES = { en, de } satisfies Record<string, Messages>;
export type UiLanguage = keyof typeof LOCALES;

/** The interface languages, each named in its own language for the picker. */
export const UI_LANGUAGES: readonly { id: UiLanguage; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'de', name: 'Deutsch' },
];

let current: UiLanguage = 'en';
const listeners = new Set<() => void>();

export const uiLanguage = (): UiLanguage => current;

export function isUiLanguage(id: string | null | undefined): id is UiLanguage {
  return id != null && Object.hasOwn(LOCALES, id);
}

/** The first browser language we have a translation for, else English. */
export function guessUiLanguage(locales: readonly string[]): UiLanguage {
  for (const l of locales) {
    const base = l.toLowerCase().split('-')[0];
    if (isUiLanguage(base)) return base;
  }
  return 'en';
}

/** Switches the interface language and tells every listener to redraw. */
export function setUiLanguage(lang: UiLanguage): void {
  if (lang === current) return;
  current = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn();
}

/** Runs `fn` whenever the interface language changes; returns a function that stops it. */
export function onUiLanguageChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const pluralRules = new Map<string, Intl.PluralRules>();

/** The message for `key` in the current language, with `{placeholders}` filled from `params`. */
export function t(key: MessageKey, params: Params = {}): string {
  let msg: Message = LOCALES[current][key] ?? en[key];
  if (typeof msg !== 'string') {
    const n = Number(params.n ?? 0);
    let rules = pluralRules.get(current);
    if (!rules) pluralRules.set(current, (rules = new Intl.PluralRules(current)));
    msg = rules.select(n) === 'one' ? msg.one : msg.other;
  }
  return msg.replace(/\{(\w+)\}/g, (all, name: string) => (name in params ? String(params[name]) : all));
}

/**
 * Like `t`, but placeholders may be DOM nodes (a bold number, a key cap), so
 * each language can put them where its word order needs them. Returns the
 * pieces to pass to `append` or `replaceChildren`.
 */
export function tNodes(key: MessageKey, params: Record<string, string | number | Node>): (string | Node)[] {
  const text: Params = {};
  for (const [k, v] of Object.entries(params)) if (!isNode(v)) text[k] = v;
  const out: (string | Node)[] = [];
  for (const part of t(key, text).split(/(\{\w+\})/)) {
    const node = /^\{(\w+)\}$/.exec(part)?.[1];
    const value = node === undefined ? undefined : params[node];
    if (value !== undefined && isNode(value)) out.push(value);
    else if (part) out.push(part);
  }
  return out;
}

const isNode = (v: unknown): v is Node => typeof Node !== 'undefined' && v instanceof Node;

/** Like `t`, for keys built at run time (e.g. `layout.${id}`); undefined when there is no such message. */
export function tMaybe(key: string, params?: Params): string | undefined {
  return Object.hasOwn(en, key) ? t(key as MessageKey, params) : undefined;
}

/** A number in the interface language's style: 96.5 in English, 96,5 in German. */
export function num(x: number, digits = 0): string {
  return x.toLocaleString(current, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** A 0–1 fraction as a percentage: "96.5%" in English, "96,5 %" in German. */
export function pct(x: number, digits = 0): string {
  return x.toLocaleString(current, { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Fills every `data-i18n*` element under `root` with text in the current language. */
export function applyTranslations(root: ParentNode = document): void {
  const attrs = [
    ['i18n', null],
    ['i18nTitle', 'title'],
    ['i18nAriaLabel', 'aria-label'],
    ['i18nPlaceholder', 'placeholder'],
  ] as const;
  for (const [data, attr] of attrs) {
    const sel = `[data-${data.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
    root.querySelectorAll<HTMLElement>(sel).forEach((e) => {
      const text = tMaybe(e.dataset[data]!);
      if (text === undefined) return;
      if (attr) e.setAttribute(attr, text);
      // Keep icons and other child elements; replace only the text.
      else replaceText(e, text);
    });
  }
}

/** Sets an element's own text, keeping any child elements (icons, inputs) where they are. */
function replaceText(e: HTMLElement, text: string): void {
  if (e.children.length === 0) {
    e.textContent = text;
    return;
  }
  const textNodes = [...e.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim() !== '');
  if (textNodes.length > 0) {
    textNodes[0].textContent = textNodes[0].textContent!.replace(/\S.*\S|\S/s, text);
    for (const n of textNodes.slice(1)) n.remove();
  } else {
    e.append(text);
  }
}
