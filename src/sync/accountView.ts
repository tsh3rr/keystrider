import { t, type MessageKey } from '../i18n';
import { EMAIL_LINKS, OAUTH_PROVIDERS, type Account, type AccountState, type OAuthProvider } from './account';
import { captchaEnabled, captchaToken } from './captcha';
import {
  MIN_PASSWORD, accountNotActivated, avatar, benefits, button, displayName, field, form, p, privacyLink, runIn, syncStatus,
  userIcon, usernameError, usernameField, usernameHint, type SignedIn,
} from './ui';

export { benefits } from './ui';

/**
 * The panel under the top-bar account button. Signed out: sign in, or
 * create an account (with a username). Signed in: who is signed in, the
 * sync status and a way to the profile page, where everything else lives.
 */

export type SignedOutStep =
  | { kind: 'signin' }
  | { kind: 'signup' }
  | { kind: 'code' }
  | { kind: 'code-sent'; email: string }
  | { kind: 'reset' };

const PROVIDER_LABEL: Record<OAuthProvider, MessageKey> = { google: 'account.google', github: 'account.github' };

export class AccountView {
  private state: AccountState = { signedIn: false };
  private step: SignedOutStep = { kind: 'signin' };
  private busy = false;
  private readonly captchaHost = Object.assign(document.createElement('div'), { className: 'account-captcha' });
  private error = '';
  private notice = '';
  private email = '';
  private username = '';
  /** Kept while the panel redraws (a wrong password, a taken username), dropped once signed in. */
  private password = '';
  private repeat = '';

  constructor(
    private readonly root: HTMLElement,
    private readonly account: Account,
    /** The top-bar button: "Sign in" while signed out, the account's initial and name once signed in. */
    private readonly topButton: HTMLButtonElement,
    /** One line about the account in Settings. */
    private readonly summary: HTMLElement,
    private readonly openProfile: () => void,
    /** Closes the panel (the × in the signed-out dialog). */
    private readonly close: () => void,
  ) {}

  update(state: AccountState): void {
    if (state.signedIn && !this.state.signedIn) {
      this.step = { kind: 'signin' };
      this.password = '';
      this.repeat = '';
    }
    this.state = state;
    this.render();
  }

  /** Shows signing in or creating an account the next time the panel opens signed out. */
  show(kind: 'signin' | 'signup'): void {
    if (this.state.signedIn || this.busy) return;
    this.step = { kind };
    this.error = '';
    this.render();
  }

  render(): void {
    this.root.replaceChildren(...(this.state.signedIn ? this.signedIn(this.state) : this.signedOut()));
    this.renderButton();
    this.summary.textContent = this.state.signedIn
      ? `${t('account.signedInAs', { name: displayName(this.state) })} · ${syncStatus(this.state)}`
      : t('account.signedOutStatus');
  }

  /** Focuses the first field, or the first button when signed in. */
  focus(): void {
    (this.root.querySelector<HTMLElement>('input') ?? this.root.querySelector<HTMLElement>('button'))?.focus();
  }

  private renderButton(): void {
    const b = this.topButton;
    const state = this.state;
    if (!state.signedIn) {
      b.className = 'account-btn';
      b.replaceChildren(userIcon(), Object.assign(document.createElement('span'), { textContent: t('account.button') }));
      b.title = t('account.signedOutStatus');
      b.setAttribute('aria-label', t('account.button'));
      return;
    }
    const name = displayName(state);
    b.className = 'account-btn signed-in';
    b.replaceChildren(avatar(state));
    if (state.username) {
      const label = Object.assign(document.createElement('span'), { className: 'account-name', textContent: state.username });
      label.setAttribute('aria-hidden', 'true');
      b.append(label);
    }
    b.title = `${t('account.signedInAs', { name })}\n${syncStatus(state)}`;
    b.setAttribute('aria-label', `${t('account.signedInAs', { name })}. ${syncStatus(state)}`);
  }

  private go(step: SignedOutStep): void {
    this.step = step;
    this.error = '';
    this.notice = '';
    this.render();
    this.focus();
  }

  private signedOut(): Node[] {
    const nodes: Node[] = [];
    const step = this.step;
    if (step.kind === 'signin' || step.kind === 'signup') nodes.push(this.tabs(step.kind));
    if (this.notice) nodes.push(p(this.notice, 'account-note'));
    switch (step.kind) {
      case 'signin': {
        nodes.push(...this.providers());
        const email = this.emailField();
        const password = this.passwordField('current-password');
        nodes.push(form([email, password], [
          { label: t('account.signIn'), primary: true, go: () => this.run(async () => this.account.signInWithPassword(email.value.trim(), password.value, await this.captcha())) },
        ]), ...this.captchaBox());
        if (EMAIL_LINKS) {
          nodes.push(button(t('account.useCode'), 'link-btn', () => this.go({ kind: 'code' })));
          nodes.push(button(t('account.forgot'), 'link-btn', () => this.go({ kind: 'reset' })));
        }
        nodes.push(p(t('account.optional'), 'account-note'));
        break;
      }
      case 'signup': {
        // E-mail and password sit where they sit when signing in, so switching tabs keeps them in place.
        nodes.push(...this.providers());
        const email = this.emailField();
        const password = this.passwordField('new-password');
        const repeat = field('password', t('account.passwordRepeat'), { autocomplete: 'new-password', minlength: String(MIN_PASSWORD) });
        repeat.value = this.repeat;
        repeat.addEventListener('input', () => (this.repeat = repeat.value));
        const username = usernameField(this.username);
        username.addEventListener('input', () => (this.username = username.value));
        nodes.push(form([email, password, repeat, username, usernameHint()], [{ label: t('account.signUp'), primary: true, go: () => {
          const name = username.value.trim();
          const problem = password.value !== repeat.value ? t('account.passwordMismatch') : usernameError(name);
          if (problem) return this.fail(problem);
          void this.run(async () => {
            const signedIn = await this.account.signUp(email.value.trim(), password.value, name, await this.captcha());
            if (signedIn) return;
            if (!EMAIL_LINKS) throw accountNotActivated();
            this.notice = t('account.confirmSent', { email: email.value.trim() });
            this.step = { kind: 'signin' };
          });
        } }]), ...this.captchaBox(), benefits());
        break;
      }
      case 'code': {
        const email = this.emailField();
        nodes.push(form([email], [{ label: t('account.sendCode'), primary: true, go: () => this.run(async () => {
          await this.account.sendCode(email.value.trim(), await this.captcha());
          this.step = { kind: 'code-sent', email: email.value.trim() };
        }) }]), ...this.captchaBox());
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
          await this.account.sendPasswordReset(email.value.trim(), await this.captcha());
          this.step = { kind: 'signin' };
          this.notice = t('account.resetSent', { email: email.value.trim() });
        }) }]), ...this.captchaBox());
        nodes.push(this.back());
        break;
      }
    }
    // The error goes right under the form's button, where the eye already is.
    const after = nodes.findIndex((n) => n instanceof HTMLFormElement) + 1 || nodes.length;
    nodes.splice(after, 0, ...this.errorLine());
    nodes.push(privacyLink());
    return nodes;
  }

  /** Where Turnstile shows its checkbox if it needs one; nothing when the captcha is off. */
  private captchaBox(): Node[] {
    if (!captchaEnabled) return [];
    this.captchaHost.replaceChildren();
    return [this.captchaHost];
  }

  private captcha(): Promise<string | undefined> {
    return captchaToken(this.captchaHost);
  }

  /** "Sign in | Create account" switch at the top of the signed-out panel. */
  private tabs(current: 'signin' | 'signup'): HTMLElement {
    const head = Object.assign(document.createElement('div'), { className: 'account-tabs-row' });
    const row = Object.assign(document.createElement('div'), { className: 'account-tabs' });
    row.setAttribute('role', 'tablist');
    for (const kind of ['signin', 'signup'] as const) {
      const b = button(t(kind === 'signin' ? 'account.signIn' : 'account.signUp'), '', () => {
        if (this.step.kind !== kind) this.go({ kind });
      });
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(kind === current));
      row.append(b);
    }
    const close = button('×', 'account-close', this.close);
    close.setAttribute('aria-label', t('account.close'));
    close.title = t('account.close');
    head.append(row, close);
    return head;
  }


  private providers(): Node[] {
    const nodes: Node[] = OAUTH_PROVIDERS.map((provider) => button(t(PROVIDER_LABEL[provider]), 'account-provider', () =>
      this.run(() => this.account.signInWithProvider(provider))));
    if (nodes.length) nodes.push(p(t('account.orEmail'), 'account-or'));
    return nodes;
  }

  /** The e-mail field, keeping what was typed when the panel redraws (e.g. after a wrong password). */
  private emailField(): HTMLInputElement {
    const input = field('email', t('account.email'), { autocomplete: 'email' });
    input.value = this.email;
    input.addEventListener('input', () => (this.email = input.value));
    return input;
  }

  private passwordField(autocomplete: 'current-password' | 'new-password'): HTMLInputElement {
    const input = field('password', t('account.password'), autocomplete === 'new-password' ? { autocomplete, minlength: String(MIN_PASSWORD) } : { autocomplete });
    input.value = this.password;
    input.addEventListener('input', () => (this.password = input.value));
    return input;
  }

  private back(): HTMLButtonElement {
    return button(t('account.back'), 'link-btn', () => this.go({ kind: 'signin' }));
  }

  private signedIn(state: SignedIn): Node[] {
    const head = Object.assign(document.createElement('div'), { className: 'account-head' });
    const who = document.createElement('div');
    who.append(p(displayName(state), 'account-email'));
    if (state.username) who.append(p(state.email, 'account-note account-address'));
    head.append(avatar(state, 'account-avatar large'), who);
    const nodes: Node[] = [head];
    // Prompted once the server said there is none (Google sign-in, or an account from before usernames).
    // A password-reset link signed in: the new password is chosen on the profile page.
    const ask = state.choosePassword ? ['account.choosePassword', 'account.choosePasswordGo'] as const
      : state.username === null ? ['account.usernameMissing', 'account.usernameChoose'] as const : null;
    if (ask) {
      const callout = Object.assign(document.createElement('div'), { className: 'account-callout' });
      callout.append(p(t(ask[0]), 'account-note'), button(t(ask[1]), 'primary', this.openProfile));
      nodes.push(callout);
    }
    nodes.push(
      p(syncStatus(state), state.sync === 'error' ? 'account-error' : 'account-note'),
      button(t('account.profile'), ask ? 'link-btn' : 'primary', this.openProfile),
      button(t('account.syncNow'), 'link-btn', () => this.run(() => this.account.syncNow())),
      button(t('account.signOut'), 'link-btn', () => this.run(() => this.account.signOut())),
      ...this.errorLine(),
    );
    return nodes;
  }

  private errorLine(): Node[] {
    return this.error ? [p(this.error, 'account-error', 'alert')] : [];
  }

  private fail(message: string): void {
    this.error = message;
    this.render();
    this.focus();
  }


  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.error = '';
    this.notice = '';
    this.error = await runIn(this.root, work);
    this.busy = false;
    this.render();
  }
}
