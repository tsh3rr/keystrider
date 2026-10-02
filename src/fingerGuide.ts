import { ROWS, keyLabel } from './layouts';
import { HOME_ROW, describeFinger, fingerFor, fingerId, guideFor } from './fingers';

/**
 * On-screen keyboard for the practice screen: keys are tinted by the finger
 * that presses them, the next key is highlighted, and the caption names the
 * finger. Rendered from the layout maps, so a German keyboard shows QWERTZ.
 */
export class FingerGuide {
  private readonly keysEl: HTMLElement;
  private readonly captionEl: HTMLElement;
  private readonly homeEl: HTMLElement;
  private layout = '';
  private keyEls = new Map<string, HTMLElement>();
  private lit: HTMLElement[] = [];

  constructor(private readonly root: HTMLElement) {
    this.captionEl = el('p', 'fg-caption');
    this.captionEl.setAttribute('aria-live', 'polite');
    this.keysEl = el('div', 'kb fg-kb');
    this.keysEl.setAttribute('aria-hidden', 'true');
    this.homeEl = el('p', 'fg-home');
    root.replaceChildren(this.captionEl, this.keysEl, this.homeEl);
  }

  set hidden(v: boolean) {
    this.root.hidden = v;
  }

  setLayout(layoutId: string): void {
    if (layoutId === this.layout) return;
    this.layout = layoutId;
    this.keyEls.clear();
    this.lit = [];
    const label = (code: string) => keyLabel(layoutId, code);

    const rows = ROWS.map((row, r) => {
      const rowEl = el('div', `kb-row kb-row-${r}`);
      // Shift keys are drawn on the bottom row, for capitals.
      const codes = r === 3 ? ['ShiftLeft', ...row, 'ShiftRight'] : row;
      for (const code of codes) {
        const isShift = code.startsWith('Shift');
        // Keys this layout lacks (e.g. no ISO key on US) are left out.
        if (!isShift && label(code) === code) continue;
        rowEl.append(this.key(code, isShift ? 'Shift' : label(code), isShift ? 'fg-shift' : ''));
      }
      return rowEl;
    });
    const space = el('div', 'kb-row kb-row-space');
    space.append(this.key('Space', 'Space', 'kb-space'));
    this.keysEl.replaceChildren(...rows, space);

    const [left, right] = [HOME_ROW.slice(0, 4), HOME_ROW.slice(4)].map((codes) => codes.map(label).join(' '));
    this.homeEl.textContent =
      `Home row: rest your fingers on ${left} and ${right}, thumbs on Space. ` +
      `Feel for the bumps on ${label('KeyF')} and ${label('KeyJ')}, and return there after each key.`;
  }

  /** Highlights the key for the next character, or clears the guide when there is none. */
  show(ch: string | undefined): void {
    for (const k of this.lit) k.classList.remove('fg-next', 'fg-from');
    this.lit = [];
    if (ch === undefined) {
      this.captionEl.textContent = '';
      return;
    }
    const g = guideFor(this.layout, ch);
    if (!g) {
      this.captionEl.textContent = `No finger hint for ${ch} yet.`;
      return;
    }
    const light = (code: string | null, cls: string) => {
      const k = code ? this.keyEls.get(code) : undefined;
      if (!k) return;
      k.classList.add(cls);
      this.lit.push(k);
    };
    light(g.code, 'fg-next');
    if (g.shift) light(g.shift, 'fg-next');
    light(g.home, 'fg-from');

    const name = ch === ' ' ? 'Space' : keyLabel(this.layout, g.code);
    let text = `${g.shift ? `Shift + ${ch}` : name}: ${describeFinger(g.finger)}`;
    if (g.home) text += `, reaching from ${keyLabel(this.layout, g.home)}`;
    if (g.shift) text += `. Hold Shift with your ${g.shift === 'ShiftLeft' ? 'left' : 'right'} pinky`;
    this.captionEl.textContent = text + '.';
  }

  private key(code: string, label: string, cls: string): HTMLElement {
    const f = fingerFor(code);
    const home = HOME_ROW.includes(code);
    const bump = code === 'KeyF' || code === 'KeyJ';
    const k = el('div', `kb-key fg-key ${f ? `fg-${fingerId(f)}` : ''} ${home ? 'fg-home-key' : ''} ${bump ? 'fg-bump' : ''} ${cls}`, label);
    this.keyEls.set(code, k);
    return k;
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
