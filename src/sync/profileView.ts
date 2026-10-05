import { t } from '../i18n';
import type { Account, AccountState } from './account';
import {
  MIN_PASSWORD, avatar, benefits, button, displayName, field, form, p, privacyLink, runIn, syncStatus,
  usernameError, usernameField, usernameHint, type SignedIn,
} from './ui';

/**
 * The profile page: username, password, sync and the account itself, for
 * whoever is signed in. Signed out it says so and offers the sign-in panel.
 */

type Card = 'username' | 'password' | 'sync' | 'account';

export class ProfileView {
  private state: AccountState = { signedIn: false };
  private busy = false;
  /** The outcome of the last action, shown in the card it came from. */
  private message: { card: Card; text: string; error: boolean } | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly account: Account,
    private readonly openSignIn: () => void,
  ) {}

  update(state: AccountState): void {
    if (state.signedIn && !this.state.signedIn) this.message = null;
    this.state = state;
    this.render();
  }

  render(): void {
    this.root.replaceChildren(...(this.state.signedIn ? this.signedIn(this.state) : this.signedOut()));
  }

  /** Focuses the first thing that needs doing: a missing username or a new password. */
  focus(): void {
    const target = this.state.signedIn && (this.state.choosePassword ? '#profile-password input' : this.state.username === null ? '#profile-username input' : null);
    (target ? this.root.querySelector<HTMLElement>(target) : null)?.focus();
  }

  private signedOut(): Node[] {
    const card = this.card(null, t('account.title'));
    // E.g. "Your account was deleted."
    if (this.message?.text) card.append(p(this.message.text, this.message.error ? 'account-error' : 'account-ok', 'status'));
    card.append(p(t('account.signedOutStatus'), 'account-note'), benefits(),
      button(t('account.button'), 'primary', this.openSignIn), privacyLink());
    return [card];
  }

  private signedIn(state: SignedIn): Node[] {
    const hero = Object.assign(document.createElement('div'), { className: 'profile-hero' });
    const who = document.createElement('div');
    who.append(
      Object.assign(document.createElement('h3'), { textContent: displayName(state) }),
      p(state.username ? state.email : t('account.usernameMissing'), 'account-note'),
    );
    hero.append(avatar(state, 'account-avatar huge'), who);

    const name = this.card('username', t('account.username'));
    name.id = 'profile-username';
    const input = usernameField(state.username ?? '');
    name.append(form([input], [{ label: t('account.usernameSave'), primary: true, go: () => {
      const value = input.value.trim();
      if (value === state.username) return;
      const problem = usernameError(value);
      if (problem) return this.show('username', problem, true);
      void this.run('username', () => this.account.setUsername(value), t('account.usernameSaved'));
    } }]), usernameHint());

    const password = this.card('password', t('account.password'));
    password.id = 'profile-password';
    if (state.choosePassword) password.append(p(t('account.choosePassword'), 'account-note'));
    const pw = field('password', t('account.newPassword'), { autocomplete: 'new-password', minlength: String(MIN_PASSWORD) });
    const repeat = field('password', t('account.passwordRepeat'), { autocomplete: 'new-password', minlength: String(MIN_PASSWORD) });
    password.append(form([pw, repeat], [{ label: t('account.savePassword'), primary: true, go: () => {
      if (pw.value !== repeat.value) return this.show('password', t('account.passwordMismatch'), true);
      void this.run('password', () => this.account.setPassword(pw.value), t('account.passwordSaved'));
    } }]));

    const sync = this.card('sync', t('account.syncTitle'));
    sync.append(
      p(syncStatus(state), state.sync === 'error' ? 'account-error' : 'account-note'),
      p(t('account.syncExplain'), 'account-note'),
      button(t('account.syncNow'), '', () => this.run('sync', () => this.account.syncNow(), '')),
    );

    const acct = this.card('account', t('account.title'));
    const actions = Object.assign(document.createElement('div'), { className: 'account-actions' });
    actions.append(
      button(t('account.signOut'), '', () => this.run('account', () => this.account.signOut(), '')),
      button(t('account.delete'), 'danger', () => {
        if (!confirm(t('account.deleteConfirm'))) return;
        void this.run('account', () => this.account.deleteAccount(), t('account.deleted'));
      }),
    );
    acct.append(p(t('account.deleteExplain'), 'account-note'), actions, privacyLink());

    // Messages go at the end of their card, where the learner is looking.
    for (const card of [name, password, sync, acct]) {
      const msg = this.message;
      if (msg && card.dataset.card === msg.card && msg.text) card.append(p(msg.text, msg.error ? 'account-error' : 'account-ok', msg.error ? 'alert' : 'status'));
    }
    return [hero, name, password, sync, acct];
  }

  private card(card: Card | null, title: string): HTMLElement {
    const el = Object.assign(document.createElement('section'), { className: 'pg-card profile-card' });
    if (card) el.dataset.card = card;
    el.append(Object.assign(document.createElement('h2'), { textContent: title }));
    return el;
  }

  private show(card: Card, text: string, error: boolean): void {
    this.message = { card, text, error };
    this.render();
    this.root.querySelector<HTMLElement>(`[data-card="${card}"] input`)?.focus();
  }

  private async run(card: Card, work: () => Promise<void>, done: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.message = null;
    const error = await runIn(this.root, work);
    this.busy = false;
    this.message = { card, text: error || done, error: error !== '' };
    this.render();
  }
}
