import { num, t } from '../i18n';
import type { Account, AccountState } from './account';
import {
  MAX_BUDDIES, buddyWeek, inviteLink, loadShareSpeed, pendingInvite, saveShareSpeed, savePendingInvite,
  type BuddyRow, type BuddyStats,
} from './buddies';
import { button, errorMessage, p } from './ui';

/**
 * The "Training buddies" card on the Progress page, and the invite prompt
 * on the practice page for someone who opened an invite link.
 */

export interface BuddiesDeps {
  /** The learner's numbers for this week, as buddies will see them. */
  stats: () => Promise<BuddyStats>;
  /** Monday of the current week, YYYY-MM-DD. */
  week: () => string;
  openSignIn: (kind: 'signin' | 'signup') => void;
  openProfile: () => void;
  openProgress: () => void;
}

/** A translated message for a failed buddy action. */
export function buddyError(err: unknown): string {
  switch ((err as { code?: string })?.code) {
    case 'buddy:username_required': return t('buddies.errUsername');
    case 'buddy:already_in_group': return t('buddies.errAlreadyIn');
    case 'buddy:group_full': return t('buddies.errFull', { n: MAX_BUDDIES });
    case 'buddy:invalid_invite': return t('buddies.errInvalid');
  }
  return errorMessage(err);
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export class BuddiesView {
  private state: AccountState = { signedIn: false };
  /** null until loaded for the signed-in account. */
  private rows: BuddyRow[] | null = null;
  private message: { text: string; error: boolean } | null = null;
  private busy = false;

  constructor(private readonly root: HTMLElement, private readonly account: Account, private readonly deps: BuddiesDeps) {}

  update(state: AccountState): void {
    const changedUser = state.signedIn !== this.state.signedIn;
    this.state = state;
    if (changedUser) {
      this.rows = null;
      this.message = null;
    }
    this.render();
  }

  /** Loads the group and shares this week's numbers with it. */
  async refresh(): Promise<void> {
    if (!this.state.signedIn) return this.render();
    try {
      const week = this.deps.week();
      let rows = await this.account.buddies(week);
      if (rows.length > 0) {
        const stats = await this.deps.stats();
        await this.account.publishBuddyStats(stats);
        rows = rows.map((r) => (r.is_me ? { ...r, ...stats } : r));
      }
      this.rows = rows;
    } catch (err) {
      console.error('Failed to load buddies', err);
      this.message = { text: buddyError(err), error: true };
    }
    this.render();
  }

  render(): void {
    const head = el('div', 'pg-card-head');
    head.append(el('h2', undefined, t('buddies.title')));
    const body: Node[] = [head];
    const s = this.state;
    if (!s.signedIn) {
      body.push(
        p(t('buddies.pitch'), 'pg-sub'),
        p(t('buddies.needAccount'), 'pg-sub'),
        button(t('buddies.signIn'), 'primary', () => this.deps.openSignIn('signup')),
      );
    } else if (s.username === null) {
      body.push(p(t('buddies.pitch'), 'pg-sub'), p(t('buddies.errUsername'), 'pg-sub'),
        button(t('buddies.chooseName'), 'primary', () => this.deps.openProfile()));
    } else if (this.rows === null) {
      body.push(p(t('buddies.loading'), 'pg-sub'));
    } else if (this.rows.length === 0) {
      body.push(
        p(t('buddies.pitch'), 'pg-sub'),
        p(t('buddies.shared', { n: MAX_BUDDIES }), 'pg-sub'),
        button(t('buddies.create'), 'primary', () => this.run(() => this.account.createBuddyGroup())),
        p(t('buddies.invitedHint'), 'pg-sub'),
      );
    } else {
      body.push(...this.group(this.rows));
    }
    if (this.message) body.push(p(this.message.text, this.message.error ? 'account-error' : 'account-ok', this.message.error ? 'alert' : 'status'));
    this.root.replaceChildren(...body);
  }

  private group(rows: BuddyRow[]): Node[] {
    const week = this.deps.week();
    const me = rows.find((r) => r.is_me);
    const owner = me?.is_owner ?? false;
    const list = el('ul', 'bd-list');
    for (const r of rows) {
      const w = buddyWeek(r, week);
      const name = r.username ?? '?';
      const li = el('li', `bd-row${r.is_me ? ' me' : ''}`);
      const who = el('div', 'bd-who');
      const title = el('div', 'bd-name', name);
      if (r.is_me) title.append(el('small', undefined, ` ${t('buddies.you')}`));
      const meta: string[] = [];
      if (w.goal === null) meta.push(t('buddies.nothingYet'));
      else {
        meta.push(w.met ? t('buddies.goalMet') : t('buddies.days', { n: w.days, goal: w.goal }));
        if (w.streak > 0) meta.push(t('buddies.streak', { n: w.streak }));
        if (w.wpm !== null) meta.push(t('progress.wpm', { n: num(w.wpm) }));
      }
      const bar = el('div', 'bd-bar');
      const fill = el('i');
      fill.style.width = `${w.goal ? Math.min(1, w.days / w.goal) * 100 : 0}%`;
      if (w.met) bar.classList.add('met');
      bar.append(fill);
      who.append(title, el('div', `bd-meta${w.met ? ' good' : ''}`, meta.join(' · ')), bar);
      li.append(el('span', 'bd-avatar', ([...name][0] ?? '?').toUpperCase()), who);

      const cheer = el('button', 'bd-cheer');
      cheer.type = 'button';
      cheer.append('👏', el('span', undefined, num(r.cheers)));
      if (r.is_me) {
        cheer.disabled = true;
        cheer.title = t('buddies.cheersGot', { n: r.cheers });
      } else {
        cheer.title = r.cheered ? t('buddies.cheered') : t('buddies.cheer', { name });
        cheer.setAttribute('aria-pressed', String(r.cheered));
        cheer.disabled = r.cheered;
        cheer.addEventListener('click', () => this.run(() => this.account.cheerBuddy(r.user_id, week)));
      }
      cheer.setAttribute('aria-label', cheer.title);
      li.append(cheer);
      if (owner && !r.is_me) {
        const remove = button('✕', 'icon-btn bd-remove', () => {
          if (confirm(t('buddies.removeConfirm', { name }))) this.run(() => this.account.removeBuddy(r.user_id));
        });
        remove.setAttribute('aria-label', t('buddies.remove', { name }));
        remove.title = t('buddies.remove', { name });
        li.append(remove);
      }
      list.append(li);
    }

    const link = inviteLink(rows[0].invite_code);
    const invite = el('div', 'bd-invite');
    const input = Object.assign(el('input', 'account-input bd-link'), { value: link, readOnly: true });
    input.setAttribute('aria-label', t('buddies.inviteLabel'));
    input.addEventListener('focus', () => input.select());
    const actions = el('div', 'account-actions');
    actions.append(button(t('buddies.copy'), 'primary', () => {
      navigator.clipboard.writeText(link).then(
        () => this.say(t('buddies.copied'), false),
        () => { input.focus(); input.select(); },
      );
    }));
    if (typeof navigator.share === 'function') {
      actions.append(button(t('buddies.share'), '', () => {
        navigator.share({ title: 'Keystrider', text: t('buddies.shareText'), url: link }).catch(() => undefined);
      }));
    }
    if (owner) actions.append(button(t('buddies.newLink'), 'link-btn', () => {
      if (confirm(t('buddies.newLinkConfirm'))) this.run(() => this.account.newBuddyInvite());
    }));
    invite.append(el('h3', undefined, t('buddies.inviteTitle')), input, actions,
      p(rows.length >= MAX_BUDDIES ? t('buddies.full', { n: MAX_BUDDIES }) : t('buddies.inviteHint', { n: MAX_BUDDIES }), 'pg-sub'));

    const speed = el('label', 'switch-row bd-speed', t('buddies.shareSpeed'));
    const toggle = Object.assign(el('input'), { type: 'checkbox', checked: loadShareSpeed() });
    toggle.setAttribute('role', 'switch');
    toggle.addEventListener('change', () => {
      saveShareSpeed(toggle.checked);
      void this.refresh();
    });
    speed.append(toggle);

    const leave = button(t('buddies.leave'), 'link-btn bd-leave', () => {
      if (confirm(t('buddies.leaveConfirm'))) this.run(() => this.account.leaveBuddyGroup());
    });
    return [list, invite, speed, p(t('buddies.privacy'), 'pg-sub'), leave];
  }

  private say(text: string, error: boolean): void {
    this.message = { text, error };
    this.render();
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.message = null;
    this.root.querySelectorAll('button, input').forEach((e) => ((e as HTMLButtonElement).disabled = true));
    try {
      await work();
    } catch (err) {
      console.error('Buddy action failed', err);
      this.message = { text: buddyError(err), error: true };
    } finally {
      this.busy = false;
    }
    await this.refresh();
  }
}

/**
 * The line on the practice page after opening an invite link: who invites,
 * and Join. Joining needs an account with a username; the invite waits
 * through signing up.
 */
export class InvitePrompt {
  private state: AccountState = { signedIn: false };
  private joined = false;

  constructor(private readonly root: HTMLElement, private readonly account: Account, private readonly deps: BuddiesDeps) {}

  update(state: AccountState): void {
    const signedInNow = state.signedIn && !this.state.signedIn;
    this.state = state;
    if (signedInNow && pendingInvite()) void this.show();
  }

  async show(): Promise<void> {
    const code = pendingInvite();
    if (!code) return;
    this.joined = false;
    this.root.hidden = false;
    this.paint(t('buddies.loading'), []);
    try {
      const invite = await this.account.buddyInvite(code);
      if (!invite) return this.done(t('buddies.errInvalid'));
      if (invite.full) return this.done(t('buddies.errFull', { n: MAX_BUDDIES }));
      const text = invite.owner ? t('buddies.invitedBy', { name: invite.owner }) : t('buddies.invited');
      this.paint(text, [
        button(t('buddies.join'), 'primary', () => void this.join(code)),
        button(t('buddies.notNow'), 'link-btn', () => this.dismiss()),
      ]);
    } catch (err) {
      console.error('Failed to read invite', err);
      this.paint(buddyError(err), [button(t('buddies.notNow'), 'link-btn', () => this.dismiss())]);
    }
  }

  private async join(code: string): Promise<void> {
    if (!this.state.signedIn) {
      this.paint(t('buddies.joinSignIn'), [button(t('buddies.signIn'), 'primary', () => this.deps.openSignIn('signup'))]);
      this.deps.openSignIn('signup');
      return;
    }
    try {
      await this.account.joinBuddyGroup(code);
      savePendingInvite(null);
      this.joined = true;
      this.paint(t('buddies.joined'), [
        button(t('buddies.openProgress'), 'primary', () => {
          this.root.hidden = true;
          this.deps.openProgress();
        }),
        button(t('buddies.close'), 'link-btn', () => (this.root.hidden = true)),
      ]);
    } catch (err) {
      const reason = (err as { code?: string })?.code;
      if (reason === 'buddy:username_required') {
        this.paint(t('buddies.errUsername'), [button(t('buddies.chooseName'), 'primary', () => this.deps.openProfile())]);
      } else if (reason === 'buddy:invalid_invite' || reason === 'buddy:group_full' || reason === 'buddy:already_in_group') {
        this.done(buddyError(err));
      } else {
        this.paint(buddyError(err), [button(t('buddies.join'), 'primary', () => void this.join(code))]);
      }
    }
  }

  /** A final message: the invite is used up either way. */
  private done(text: string): void {
    savePendingInvite(null);
    this.paint(text, [button(t('buddies.close'), 'link-btn', () => (this.root.hidden = true))]);
  }

  private dismiss(): void {
    savePendingInvite(null);
    this.root.hidden = true;
  }

  private paint(text: string, actions: HTMLElement[]): void {
    const row = el('div', 'bd-prompt-actions');
    row.append(...actions);
    this.root.replaceChildren(el('span', undefined, text), row);
  }

  /** Redraws in a new interface language. */
  retranslate(): void {
    if (this.root.hidden) return;
    if (this.joined) {
      this.root.hidden = true;
      return;
    }
    void this.show();
  }
}
