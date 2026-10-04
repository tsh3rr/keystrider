import { uiLanguage } from '../i18n';

/**
 * Cloudflare Turnstile in front of e-mail sign-in and sign-up, so scripts
 * cannot create accounts by the thousand. Supabase checks the token
 * (Authentication → Attack Protection). Off while the site key is empty
 * (see vite.config.ts); Google sign-in never needs it.
 *
 * The Turnstile script is only loaded when someone actually submits one of
 * these forms, not on every visit.
 */

const SITE_KEY = __TURNSTILE_SITE_KEY__;
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

export const captchaEnabled = SITE_KEY !== '';

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widgetId: string): void;
}

declare global {
  interface Window { turnstile?: Turnstile }
}

let loading: Promise<Turnstile> | null = null;

function loadTurnstile(): Promise<Turnstile> {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = Object.assign(document.createElement('script'), { src: SCRIPT, async: true });
    script.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject(captchaError())));
    script.addEventListener('error', () => reject(captchaError()));
    document.head.append(script);
  }).catch((err) => {
    loading = null; // try again on the next submit
    throw err;
  });
  return loading;
}

const captchaError = () => Object.assign(new Error('captcha failed'), { code: 'captcha_failed' });

let widget: string | null = null;

/**
 * A fresh one-time token, or undefined when the captcha is off. Usually
 * arrives without anything to do; when Turnstile is unsure, a checkbox
 * appears in `host` and the token comes once it is ticked.
 */
export async function captchaToken(host: HTMLElement): Promise<string | undefined> {
  if (!captchaEnabled) return undefined;
  const turnstile = await loadTurnstile();
  if (widget !== null) turnstile.remove(widget);
  host.replaceChildren();
  return new Promise((resolve, reject) => {
    widget = turnstile.render(host, {
      sitekey: SITE_KEY,
      appearance: 'interaction-only',
      language: uiLanguage(),
      callback: (token: string) => resolve(token),
      'error-callback': () => {
        reject(captchaError());
        return true;
      },
      'expired-callback': () => reject(captchaError()),
    });
  });
}
