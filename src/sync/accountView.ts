import { t, uiLanguage, type MessageKey } from '../i18n';
import { EMAIL_LINKS, OAUTH_PROVIDERS, type Account, type AccountState, type OAuthProvider } from './account';

/**
 * The Account group in Settings: sign in with Google or e-mail and
 * password (and, once e-mail can be sent, by a one-time code), then see the
 * sync status, sync by hand, sign out or delete the account.
 */

type Step =
  | { kind: 'password' }
  | { kind: 'code' }
  | { kind: 'code-sent'; email: string }
  | { kind: 'reset' };

const PROVIDER_LABEL: Record<OAuthProvider, MessageKey> = { google: 'account.google', github: 'account.github' };
const MIN_PASSWORD = 8;

export class AccountView {
  private state: AccountState = { signedIn: false };
  private step: Step = { kind: 'password' };
  private busy = false;
  private error = '';
  private notice = '';
  private email = '';

  constructor(private readonly root: HTMLElement, private readonly account: Account) {}

  update(state: AccountState): void {
    if (state.signedIn && !this.state.signedIn) this.step = { kind: 'password' };
    this.state = state;
    this.render();
  }

  render(): void {
    this.root.replaceChildren(...(this.state.signedIn ? this.signedIn(this.state) : this.signedOut()));
  }

  private go(step: Step): void {
    this.step = step;
    this.error = '';
    this.notice = '';
    this.render();
    this.root.querySelector<HTMLInputElement>('input')?.focus();
  }

  private signedOut(): Node[] {
    const nodes: Node[] = [];
    if (this.notice) nodes.push(p(this.notice, 'account-note'));
    const step = this.step;
    switch (step.kind) {
      case 'password': {
        nodes.push(p(t('account.intro'), 'account-note'));
        for (const provider of OAUTH_PROVIDERS) {
          nodes.push(button(t(PROVIDER_LABEL[provider]), 'account-provider', () =>
            this.run(() => this.account.signInWithProvider(provider))));
        }
        if (OAUTH_PROVIDERS.length) nodes.push(p(t('account.orEmail'), 'account-or'));
        const email = this.emailField();
        const password = field('password', t('account.password'), { autocomplete: 'current-password', minlength: String(MIN_PASSWORD) });
        nodes.push(form([email, password], [
          { label: t('account.signIn'), primary: true, go: () => this.run(() => this.account.signInWithPassword(email.value.trim(), password.value)) },
          { label: t('account.signUp'), go: () => this.run(async () => {
            const signedIn = await this.account.signUp(email.value.trim(), password.value);
            if (!signedIn) this.notice = t('account.confirmSent', { email: email.value.trim() });
          }) },
        ]));
        if (EMAIL_LINKS) {
          nodes.push(button(t('account.useCode'), 'link-btn', () => this.go({ kind: 'code' })));
          nodes.push(button(t('account.forgot'), 'link-btn', () => this.go({ kind: 'reset' })));
        }
        break;
      }
      case 'code': {
        const email = this.emailField();
        nodes.push(form([email], [{ label: t('account.sendCode'), primary: true, go: () => this.run(async () => {
          await this.account.sendCode(email.value.trim());
          this.step = { kind: 'code-sent', email: email.value.trim() };
        }) }]));
        nodes.push(this.back());
        break;
      }
      case 'code-sent': {
        nodes.push(p(t('account.codeSent', { email: step.email }), 'account-note'));
        const code = field('text', t('account.code'), {
          autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9]{6,10}', maxlength: '10',
        });
        nodes.push(form([code], [{ label: t('account.verify'), primary: true, go: () =>
          this.run(() => this.account.verifyCode(step.email, code.value.trim())) }]));
        nodes.push(this.back());
        break;
      }
      case 'reset': {
        const email = this.emailField();
        nodes.push(form([email], [{ label: t('account.sendReset'), primary: true, go: () => this.run(async () => {
          await this.account.sendPasswordReset(email.value.trim());
          this.step = { kind: 'password' };
          this.notice = t('account.resetSent', { email: email.value.trim() });
        }) }]));
        nodes.push(this.back());
        break;
      }
    }
    nodes.push(...this.errorLine(), privacyLink());
    return nodes;
  }

  /** The e-mail field, keeping what was typed when the group redraws (e.g. after a wrong password). */
  private emailField(): HTMLInputElement {
    const input = field('email', t('account.email'), { autocomplete: 'email' });
    input.value = this.email;
    input.addEventListener('input', () => (this.email = input.value));
    return input;
  }

  private back(): HTMLButtonElement {
    return button(t('account.back'), 'link-btn', () => this.go({ kind: 'password' }));
  }

  private signedIn(state: Extract<AccountState, { signedIn: true }>): Node[] {
    const status = state.sync === 'syncing' ? t('account.syncing')
      : state.sync === 'error' ? t('account.syncFailed')
      : state.lastSync === null ? t('account.neverSynced')
      : t('account.synced', { time: new Date(state.lastSync).toLocaleString(uiLanguage(), { dateStyle: 'short', timeStyle: 'short' }) });
    const nodes: Node[] = [p(t('account.signedInAs', { email: state.email }), 'account-email')];
    if (this.notice) nodes.push(p(this.notice, 'account-note'));
    if (state.choosePassword) {
      // Came in through a password-reset link.
      nodes.push(p(t('account.choosePassword'), 'account-note'));
      const password = field('password', t('account.newPassword'), { autocomplete: 'new-password', minlength: String(MIN_PASSWORD) });
      nodes.push(form([password], [{ label: t('account.savePassword'), primary: true, go: () => this.run(async () => {
        await this.account.setPassword(password.value);
        this.notice = t('account.passwordSaved');
      }) }]));
    }
    nodes.push(
      p(status, state.sync === 'error' ? 'account-error' : 'account-note'),
      button(t('account.syncNow'), 'link-btn', () => this.run(() => this.account.syncNow())),
      button(t('account.signOut'), 'link-btn', () => this.run(() => this.account.signOut())),
      button(t('account.delete'), 'link-btn account-delete', () => {
        if (!confirm(t('account.deleteConfirm'))) return;
        void this.run(async () => {
          await this.account.deleteAccount();
          this.notice = t('account.deleted');
        });
      }),
      ...this.errorLine(),
      privacyLink(),
    );
    return nodes;
  }

  private errorLine(): Node[] {
    return this.error ? [p(this.error, 'account-error', 'alert')] : [];
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.root.querySelectorAll('button, input').forEach((el) => ((el as HTMLButtonElement).disabled = true));
    try {
      await work();
    } catch (err) {
      console.error('Account action failed', err);
      this.error = errorMessage(err);
    } finally {
      this.busy = false;
      this.render();
    }
  }
}

/** A short, translated reason for a failed sign-in or sync. */
function errorMessage(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  switch (e?.code) {
    case 'invalid_credentials': return t('account.errorCredentials');
    case 'user_already_exists': case 'email_exists': return t('account.errorExists');
    case 'weak_password': return t('account.errorWeak', { n: MIN_PASSWORD });
    case 'email_not_confirmed': return t('account.errorNotConfirmed');
    case 'otp_expired': return t('account.errorCode');
    case 'validation_failed': case 'email_address_invalid': return t('account.errorEmail');
    case 'over_email_send_rate_limit': case 'over_request_rate_limit': return t('account.errorRateLimit');
  }
  if (e?.status === 429) return t('account.errorRateLimit');
  if (e?.name === 'AuthRetryableFetchError' || err instanceof TypeError || (typeof navigator !== 'undefined' && !navigator.onLine)) return t('account.errorOffline');
  return t('account.errorGeneric', { message: e?.message ?? String(err) });
}

function p(text: string, className: string, role?: string): HTMLParagraphElement {
  const el = Object.assign(document.createElement('p'), { textContent: text, className });
  if (role) el.setAttribute('role', role);
  return el;
}

function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = Object.assign(document.createElement('button'), { type: 'button', textContent: label, className });
  b.addEventListener('click', onClick);
  return b;
}

function field(type: string, label: string, attrs: Record<string, string>): HTMLInputElement {
  const input = Object.assign(document.createElement('input'), { type, required: true, className: 'account-input' });
  input.setAttribute('aria-label', label);
  input.placeholder = label;
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
  return input;
}


interface Action { label: string; primary?: boolean; go: () => void }

/**
 * Fields and one or more actions. Enter and the first action submit; every
 * action checks the fields first, so the browser points at what is missing.
 */
function form(inputs: HTMLInputElement[], actions: Action[]): HTMLFormElement {
  const f = Object.assign(document.createElement('form'), { className: 'account-form' });
  f.append(...inputs);
  const row = Object.assign(document.createElement('div'), { className: 'account-actions' });
  actions.forEach((a, i) => {
    const b = Object.assign(document.createElement('button'), { type: i === 0 ? 'submit' : 'button', textContent: a.label });
    if (a.primary) b.className = 'primary';
    if (i > 0) b.addEventListener('click', () => { if (f.reportValidity()) a.go(); });
    row.append(b);
  });
  f.append(row);
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    actions[0].go();
  });
  return f;
}

function privacyLink(): HTMLAnchorElement {
  return Object.assign(document.createElement('a'), { href: '/datenschutz', textContent: t('account.privacy'), className: 'account-privacy' });
}
