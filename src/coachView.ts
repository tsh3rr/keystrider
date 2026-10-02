/**
 * The slim coach bar above the practice text: four chips (path, round, speed,
 * break check) that each show a one-line summary and open a bubble with only
 * their own details. Pure display; main.ts gathers the numbers.
 */

export type ChipId = 'path' | 'round' | 'now' | 'fresh';

export interface CoachData {
  path: {
    /** Name of the current stage and how far into it, e.g. "Letters", 14, 26. */
    stage: string;
    done: number;
    total: number;
    /** Key cap of the next unlock, or null when everything is unlocked. */
    next: string | null;
    stages: { name: string; done: number; total: number; state: 'done' | 'current' | 'locked' }[];
    /** What the next unlock waits on. */
    about: string;
  };
  round: {
    steps: { name: string; state: 'done' | 'current' | 'upcoming' | 'locked' }[];
    /** Name of the drill being typed (or the one Enter starts next). */
    current: string;
    /** What this kind of drill is for. */
    about: string;
    /** The drill's target keys and letter pairs, as shown on screen. */
    focus: string[];
  };
  now: {
    /** Live speed; null before typing starts or while speed is hidden in accuracy recovery. */
    wpm: number | null;
    /** First-try accuracy so far, 0–1; null before typing starts. */
    accuracy: number | null;
    usualWpm: number | null;
    recovery: boolean;
    level: string;
    weakest: { label: string; errorRate: number }[];
  };
  fresh: {
    enabled: boolean;
    /** Typing minutes in this stretch. */
    minutes: number;
    /** A break suggestion is showing. */
    due: boolean;
    longMinutes: number;
  };
}

import { percent, plural, t } from './i18n';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const pct = (x: number) => percent(x);
/** Width of a bar, independent of the app language. */
const width = (x: number) => `${Math.round(x * 100)}%`;

/** Text with the `\0` placeholder replaced by `value` in bold. */
function bold(text: string, value: string): (Node | string)[] {
  const [before, after = ''] = text.split('\0');
  return [before, el('b', '', value), after].filter((p) => p !== '');
}

export class CoachBar {
  private data: CoachData | null = null;
  private open: ChipId | null = null;
  private readonly chips: Map<ChipId, HTMLButtonElement>;

  /**
   * `onProgress` opens the Progress view; `onClose` runs when a bubble closes
   * so the caller can put the focus back on the typing field.
   */
  constructor(
    bar: HTMLElement,
    private readonly pop: HTMLElement,
    private readonly onProgress: () => void,
    private readonly onClose: () => void,
  ) {
    this.chips = new Map([...bar.querySelectorAll<HTMLButtonElement>('[data-pop]')].map((b) => [b.dataset.pop as ChipId, b]));
    for (const [id, chip] of this.chips) {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.open === id) this.close();
        else this.show(id);
      });
    }
    pop.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => this.close(false));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) {
        e.preventDefault();
        this.close();
      }
    });
    window.addEventListener('resize', () => this.place());
  }

  get isOpen(): boolean {
    return this.open !== null;
  }

  update(data: CoachData): void {
    this.data = data;
    this.renderChips();
    if (this.open) this.renderPop();
  }

  /** Refreshes only the speed chip, cheap enough for every keystroke. */
  updateNow(now: CoachData['now']): void {
    if (!this.data) return;
    this.data.now = now;
    this.chipNow();
  }

  close(refocus = true): void {
    if (!this.open) return;
    this.chips.get(this.open)?.setAttribute('aria-expanded', 'false');
    this.chips.get(this.open)?.classList.remove('on');
    this.open = null;
    this.pop.hidden = true;
    if (refocus) this.onClose();
  }

  private show(id: ChipId): void {
    if (this.open) this.close(false);
    this.open = id;
    const chip = this.chips.get(id)!;
    chip.setAttribute('aria-expanded', 'true');
    chip.classList.add('on');
    this.renderPop();
    this.pop.hidden = false;
    this.place();
  }

  /** Puts the bubble under its chip, kept inside the bar's width, with the arrow pointing at the chip. */
  private place(): void {
    if (!this.open) return;
    const chip = this.chips.get(this.open)!;
    const box = this.pop.offsetParent?.getBoundingClientRect();
    if (!box) return;
    const c = chip.getBoundingClientRect();
    const w = this.pop.offsetWidth;
    const centre = c.left - box.left + c.width / 2;
    const left = Math.max(0, Math.min(centre - w / 2, box.width - w));
    this.pop.style.left = `${left}px`;
    this.pop.style.top = `${c.bottom - box.top + 8}px`;
    this.pop.style.setProperty('--arrow', `${centre - left}px`);
  }

  private renderChips(): void {
    const d = this.data!;
    const path = this.chips.get('path')!.querySelector('#chip-path')!;
    const meter = el('span', 'meter');
    meter.append(el('i'));
    (meter.firstChild as HTMLElement).style.width = width(d.path.total ? d.path.done / d.path.total : 1);
    const parts: (Node | string)[] = [d.path.stage + ' '];
    if (d.path.total > 1) parts.push(el('b', '', `${d.path.done}/${d.path.total}`));
    parts.push(meter);
    if (d.path.next) parts.push(`${t('chip.next')} `, el('b', '', d.path.next));
    path.replaceChildren(...parts);

    const round = this.chips.get('round')!.querySelector('#chip-round')!;
    const dots = el('span', 'dots');
    for (const s of d.round.steps) dots.append(el('i', s.state));
    const keys = el('span', 'keys');
    for (const f of d.round.focus.slice(0, 3)) keys.append(el('kbd', '', f));
    round.replaceChildren(dots, d.round.focus.length ? keys : el('b', '', d.round.current));

    this.chipNow();

    const fresh = this.chips.get('fresh')!.querySelector('#chip-fresh')!;
    const state = !d.fresh.enabled ? 'off' : d.fresh.due ? 'due' : 'ok';
    fresh.replaceChildren(el('span', `dot ${state}`), t(`chip.fresh.${state}`));
  }

  private chipNow(): void {
    const n = this.data!.now;
    const now = this.chips.get('now')!.querySelector('#chip-now')!;
    if (n.accuracy === null) {
      now.replaceChildren(...(n.usualWpm ? bold(t('chip.usual', { wpm: '\0' }), String(n.usualWpm)) : [t('chip.ready')]));
    } else if (n.wpm === null) {
      now.replaceChildren(...bold(t('chip.accuracy', { pct: '\0' }), pct(n.accuracy)));
    } else {
      now.replaceChildren(...bold(t('chip.wpm', { wpm: '\0' }), String(n.wpm)), ' · ', el('b', '', pct(n.accuracy)));
    }
  }

  private renderPop(): void {
    const d = this.data!;
    const sec = el('div', 'pop-sec');
    const title = (t: string) => el('span', 'pop-title', t);
    switch (this.open) {
      case 'path': {
        const list = el('ol', 'pop-stages');
        for (const s of d.path.stages) {
          const li = el('li', s.state);
          const bar = el('i');
          const fill = el('b');
          fill.style.width = width(s.state === 'done' ? 1 : s.total ? s.done / s.total : 0);
          bar.append(fill);
          li.append(bar, s.total > 1 && s.state === 'current' ? `${s.name} ${s.done}/${s.total}` : s.name);
          list.append(li);
        }
        sec.append(title(t('pop.path')), list, el('p', 'pop-note', d.path.about));
        break;
      }
      case 'round': {
        const list = el('ol', 'pop-round');
        for (const s of d.round.steps) list.append(el('li', s.state, s.name));
        sec.append(title(t('pop.round')), list);
        if (d.round.focus.length) {
          const focus = el('div', 'pop-focus');
          focus.append(t('pop.focusKeys'));
          for (const f of d.round.focus) focus.append(el('kbd', '', f));
          sec.append(focus);
        }
        sec.append(el('p', 'pop-note', d.round.about));
        break;
      }
      case 'now': {
        const n = d.now;
        const nums = el('div', 'pop-nums');
        const num = (v: string, label: string) => {
          const box = el('div');
          box.append(el('b', '', v), el('span', '', label));
          return box;
        };
        nums.append(
          num(n.wpm === null ? '–' : String(n.wpm), n.recovery ? t('pop.wpmHidden') : n.usualWpm ? t('pop.wpmUsual', { wpm: n.usualWpm }) : t('pop.wpm')),
          num(n.accuracy === null ? '–' : pct(n.accuracy), t('pop.accuracy')),
        );
        sec.append(title(t('pop.now')), nums, el('p', 'pop-small', n.level));
        if (n.weakest.length) {
          sec.append(title(t('pop.weakest')));
          const max = Math.max(...n.weakest.map((w) => w.errorRate), 0.01);
          const rows = el('div', 'pop-weak');
          for (const w of n.weakest) {
            const row = el('div');
            const bar = el('span', 'bar');
            const fill = el('i');
            fill.style.width = width(w.errorRate / max);
            bar.append(fill);
            row.append(el('kbd', '', w.label), bar, el('small', '', percent(w.errorRate, 1)));
            rows.append(row);
          }
          sec.append(rows);
        }
        const more = el('button', 'pop-more', t('pop.more'));
        more.addEventListener('click', () => {
          this.close(false);
          this.onProgress();
        });
        sec.append(more);
        break;
      }
      case 'fresh': {
        const f = d.fresh;
        const mins = Math.round(f.minutes);
        const line = el('div', 'pop-fresh');
        const state = !f.enabled ? 'off' : f.due ? 'due' : 'ok';
        const text = el('span');
        if (state === 'off') {
          text.append(el('b', '', `${t('pop.fresh.offTitle')} `), t('pop.fresh.off'));
        } else if (state === 'due') {
          text.append(el('b', '', `${t('pop.fresh.dueTitle')} `), t('pop.fresh.due'));
        } else {
          text.append(
            el('b', '', `${t('pop.fresh.okTitle')} `),
            plural(mins, 'pop.fresh.ok.one', 'pop.fresh.ok.other', { long: f.longMinutes }),
          );
        }
        line.append(el('span', `dot ${state}`), text);
        sec.append(title(t('pop.breaks')), line);
        break;
      }
    }
    this.pop.replaceChildren(sec);
  }
}
