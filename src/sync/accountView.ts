import { t, uiLanguage } from '../i18n';
import { GOOGLE_LOGIN, type Account, type AccountState } from './account';

/**
 * The Account group in Settings: sign in with a code sent by e-mail, then
 * see the sync status, sync by hand, sign out or delete the account.
 */
export class AccountView {
  private state: AccountState = { signedIn: false };
  /** Where sign-in stands while signed out: asking for the e-mail, or for the code sent to it. */
  private pendingEmail: string | null = null;
  private busy = false;
  private error = '';
  private notice = '';

  constructor(private readonly root: HTMLElement, private readonly account: Account) {}

  update(state: AccountState): void {
    if (state.signedIn && !this.state.signedIn) this.pendingEmail = null;
    this.state = state;
    this.render();
  }

  render(): void {
    this.root.replaceChildren(...(this.state.signedIn ? this.signedIn(this.state) : this.signedOut()));
  }

  private signedOut(): Node[] {
    const nodes: Node[] = [];
    if (this.notice) nodes.push(p(this.notice, 'account-note'));
    const email = this.pendingEmail;
    if (email === null) {
      nodes.push(p(t('account.intro'), 'account-note'));
      const input = field('email', t('account.email'), { autocomplete: 'email', placeholder: t('account.emailPlaceholder') });
      nodes.push(form(input, t('account.sendCode'), (value) => this.run(async () => {
        await this.account.sendCode(value);
        this.pendingEmail = value;
      })));
      if (GOOGLE_LOGIN) {
        nodes.push(button(t('account.google'), '', () => this.run(() => this.account.signInWithGoogle())));
      }
    } else {
      nodes.push(p(t('account.codeSent', { email }), 'account-note'));
      const input = field('text', t('account.code'), {
        autocomplete: 'one-time-code', inputmode: 'numeric', pattern: '[0-9]{6,10}', maxlength: '10',
      });
      nodes.push(form(input, t('account.verify'), (value) => this.run(() => this.account.verifyCode(email, value))));
      nodes.push(button(t('account.otherEmail'), 'link-btn', () => {
        this.pendingEmail = null;
        this.error = '';
        this.render();
      }));
    }
    nodes.push(...this.errorLine(), privacyLink());
    return nodes;
  }

  private signedIn(state: Extract<AccountState, { signedIn: true }>): Node[] {
    const status = state.sync === 'syncing' ? t('account.syncing')
      : state.sync === 'error' ? t('account.syncFailed')
      : state.lastSync === null ? t('account.neverSynced')
      : t('account.synced', { time: new Date(state.lastSync).toLocaleString(uiLanguage(), { dateStyle: 'short', timeStyle: 'short' }) });
    return [
      p(t('account.signedInAs', { email: state.email }), 'account-email'),
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
    ];
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
      this.root.querySelector<HTMLInputElement>('input')?.focus();
    }
  }
}

/** A short, translated reason for a failed sign-in or sync. */
function errorMessage(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string; name?: string };
  if (e?.status === 429 || e?.code === 'over_email_send_rate_limit' || e?.code === 'over_request_rate_limit') return t('account.errorRateLimit');
  if (e?.code === 'otp_expired' || e?.code === 'invalid_credentials' || /token|otp/i.test(e?.message ?? '') && e?.status === 403) return t('account.errorCode');
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
  for (const [k, v] of Object.entries(attrs)) input.setAttribute(k, v);
  return input;
}

function form(input: HTMLInputElement, submit: string, onSubmit: (value: string) => void): HTMLFormElement {
  const f = Object.assign(document.createElement('form'), { className: 'account-form' });
  f.append(input, Object.assign(document.createElement('button'), { type: 'submit', textContent: submit, className: 'primary' }));
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const value = input.value.trim();
    if (value) onSubmit(value);
  });
  return f;
}

function privacyLink(): HTMLAnchorElement {
  return Object.assign(document.createElement('a'), { href: '/datenschutz', textContent: t('account.privacy'), className: 'account-privacy' });
}
