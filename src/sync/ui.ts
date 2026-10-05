import { t, uiLanguage } from '../i18n';
import { EMAIL_LINKS, type AccountState } from './account';
import { USERNAME_MAX, USERNAME_MIN, usernameProblem } from './username';

/** Building blocks shared by the account panel and the profile page. */

export type SignedIn = Extract<AccountState, { signedIn: true }>;

export const MIN_PASSWORD = 8;

export function displayName(state: SignedIn): string {
  return state.username ?? state.email;
}

/** A short, translated reason for a failed sign-in, sync or change. */
export function errorMessage(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  switch (e?.code) {
    case 'invalid_credentials': return t('account.errorCredentials');
    case 'user_already_exists': case 'email_exists': return t('account.errorExists');
    case 'weak_password': return t('account.errorWeak', { n: MIN_PASSWORD });
    case 'same_password': return t('account.errorSamePassword');
    // Without our own mail server no confirmation e-mail arrives, so asking for the link would only confuse.
    case 'email_not_confirmed': return t(EMAIL_LINKS ? 'account.errorNotConfirmed' : 'account.errorNotActivated');
    case 'not_activated': return t('account.errorNotActivated');
    case 'otp_expired': return t('account.errorCode');
    case 'validation_failed': case 'email_address_invalid': return t('account.errorEmail');
    case 'username_taken': return t('account.usernameTaken');
    case 'captcha_failed': return t('account.errorCaptcha');
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return t('account.errorRateLimit');
  }
  if (e?.status === 429) return t('account.errorRateLimit');
  if (e?.name === 'AuthRetryableFetchError' || err instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)) return t('account.errorOffline');
  return t('account.errorGeneric', { message: e?.message ?? String(err) });
}

/**
 * Supabase wants the e-mail address confirmed, but there is no mail server
 * yet to send the link (EMAIL_LINKS is off): "Confirm email" must be switched
 * off in the Supabase project, see docs/accounts-setup.md, step 3.
 */
export function accountNotActivated(): Error {
  console.error('Supabase asks for e-mail confirmation, but EMAIL_LINKS is off. Switch off "Confirm email" (docs/accounts-setup.md, step 3).');
  return Object.assign(new Error('Account not activated'), { code: 'not_activated' });
}

/** The translated problem with a username, or '' if it can be used. */
export function usernameError(name: string): string {
  const problem = usernameProblem(name, uiLanguage());
  if (!problem) return '';
  return t(problem === 'blocked' ? 'account.usernameBlocked' : 'account.usernameInvalid', { min: USERNAME_MIN, max: USERNAME_MAX });
}

export function usernameField(value: string, autocomplete = 'username'): HTMLInputElement {
  const input = field('text', t('account.username'), {
    autocomplete, minlength: String(USERNAME_MIN), maxlength: String(USERNAME_MAX), spellcheck: 'false', autocapitalize: 'off',
  });
  input.value = value;
  return input;
}

export function usernameHint(): HTMLParagraphElement {
  return p(t('account.usernameHint', { min: USERNAME_MIN, max: USERNAME_MAX }), 'account-hint');
}

export function p(text: string, className: string, role?: string): HTMLParagraphElement {
  const el = Object.assign(document.createElement('p'), { textContent: text, className });
  if (role) el.setAttribute('role', role);
  return el;
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className });
  b.addEventListener('click', onClick);
  return b;
}

export function field(type: string, label: string, attrs: Record<string, string>): HTMLInputElement {
  const input = Object.assign(document.createElement('input'), { type, required: true, className: 'account-input' });
  input.setAttribute('aria-label', label);
  input.placeholder = label;
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
  return input;
}

export interface Action { label: string; primary?: boolean; go: () => void; /** Runs without checking the fields, e.g. Cancel. */ skipCheck?: boolean }

/**
 * Fields and one or more actions. Enter and the first action submit; every
 * other action checks the fields first (unless told not to), so the browser
 * points at what is missing.
 */
export function form(inputs: HTMLElement[], actions: Action[]): HTMLFormElement {
  const f = Object.assign(document.createElement('form'), { className: 'account-form' });
  f.append(...inputs);
  const row = Object.assign(document.createElement('div'), { className: 'account-actions' });
  actions.forEach((a, i) => {
    const b = Object.assign(document.createElement('button'), { type: i === 0 ? 'submit' : 'button', textContent: a.label });
    if (a.primary) b.className = 'primary';
    if (i > 0) b.addEventListener('click', () => { if (a.skipCheck || f.reportValidity()) a.go(); });
    row.append(b);
  });
  f.append(row);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    actions[0].go();
  });
  return f;
}

export function privacyLink(): HTMLAnchorElement {
  return Object.assign(document.createElement('a'), { href: '/datenschutz', textContent: t('account.privacy'), className: 'account-privacy' });
}

export function syncStatus(state: SignedIn): string {
  return state.sync === 'syncing' ? t('account.syncing')
    : state.sync === 'error' ? t('account.syncFailed')
    : state.lastSync === null ? t('account.neverSynced')
    : t('account.synced', { time: new Date(state.lastSync).toLocaleString(uiLanguage(), { dateStyle: 'short', timeStyle: 'short' }) });
}

/** The account's initial in a circle, with the sync dot. */
export function avatar(state: SignedIn, className = 'account-avatar'): HTMLSpanElement {
  const el = Object.assign(document.createElement('span'), {
    className: `${className} sync-${state.sync}`, textContent: ([...displayName(state)][0] ?? '?').toUpperCase(),
  });
  el.setAttribute('aria-hidden', 'true');
  el.append(Object.assign(document.createElement('span'), { className: 'account-dot' }));
  return el;
}

/** Why an account is worth having: a heading and three short points, for the account panel, the setup and the reminder. */
export function benefits(): HTMLElement {
  const box = Object.assign(document.createElement('div'), { className: 'account-benefits' });
  const list = document.createElement('ul');
  for (const key of ['account.benefit1', 'account.benefit2', 'account.benefit3'] as const) {
    list.append(Object.assign(document.createElement('li'), { textContent: t(key) }));
  }
  box.append(Object.assign(document.createElement('strong'), { textContent: t('account.benefitsTitle') }), list);
  return box;
}

export function userIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>';
  return svg;
}

/**
 * Runs an account action for a view: disables its controls meanwhile and
 * returns the translated error, or '' when it worked.
 */
export async function runIn(root: HTMLElement, work: () => Promise<void>): Promise<string> {
  root.querySelectorAll('button, input').forEach((el) => ((el as HTMLButtonElement).disabled = true));
  try {
    await work();
    return '';
  } catch (err) {
    console.error('Account action failed', err);
    return errorMessage(err);
  }
}
