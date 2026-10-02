import { ROWS, keyLabel } from './layouts';
import { HOME_ROW, describeFinger, fingerFor, fingerId, guideFor, type FingerName } from './fingers';

const svgNS = 'http://www.w3.org/2000/svg';

/**
 * On-screen keyboard for the practice screen: keys are tinted by the finger
 * that presses them, the next key is highlighted, and the caption names the
 * finger. Rendered from the layout maps, so a German keyboard shows QWERTZ.
 * Two hand outlines underneath colour in the finger to use.
 *
 * The guide can also be shown dimmed, without saying which key comes next,
 * so the learner types from memory; `reveal` lights it up again.
 */
export class FingerGuide {
  private readonly keysEl: HTMLElement;
  private readonly captionEl: HTMLElement;
  private readonly homeEl: HTMLElement;
  private layout = '';
  private keyEls = new Map<string, HTMLElement>();
  private lit: Element[] = [];
  private readonly fingerEls = new Map<string, SVGElement>();
  private current: string | undefined;

  constructor(private readonly root: HTMLElement) {
    this.captionEl = el('p', 'fg-caption');
    this.captionEl.setAttribute('aria-live', 'polite');
    this.keysEl = el('div', 'kb fg-kb');
    this.keysEl.setAttribute('aria-hidden', 'true');
    this.homeEl = el('p', 'fg-home');
    root.replaceChildren(this.captionEl, this.keysEl, this.hands(), this.homeEl);
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

  /**
   * Highlights the key for the next character, or clears the guide when there
   * is none. With `revealed` false the guide is dimmed and gives nothing away.
   */
  show(ch: string | undefined, revealed = true): void {
    this.current = ch;
    for (const k of this.lit) k.classList.remove('fg-next', 'fg-from', 'fg-hold');
    this.lit = [];
    this.root.classList.toggle('fg-faded', !revealed && ch !== undefined);
    if (ch === undefined) {
      this.captionEl.textContent = '';
      return;
    }
    if (!revealed) {
      this.captionEl.textContent = 'Type from memory. The guide lights up if you pause or slip.';
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
    if (g.finger.name === 'thumb') {
      for (const id of ['left-thumb', 'right-thumb']) this.lightFinger(id, 'fg-next');
    } else {
      this.lightFinger(fingerId(g.finger), 'fg-next');
    }
    if (g.shift) this.lightFinger(g.shift === 'ShiftLeft' ? 'left-pinky' : 'right-pinky', 'fg-hold');

    const name = ch === ' ' ? 'Space' : keyLabel(this.layout, g.code);
    let text = `${g.shift ? `Shift + ${ch}` : name}: ${describeFinger(g.finger)}`;
    if (g.home) text += `, reaching from ${keyLabel(this.layout, g.home)}`;
    if (g.shift) text += `. Hold Shift with your ${g.shift === 'ShiftLeft' ? 'left' : 'right'} pinky`;
    this.captionEl.textContent = text + '.';
  }

  /** Lights up the guide for the character it is currently dimmed on. */
  reveal(): void {
    if (this.root.classList.contains('fg-faded')) this.show(this.current, true);
  }

  private lightFinger(id: string, cls: string): void {
    const f = this.fingerEls.get(id);
    if (!f) return;
    f.classList.add(cls);
    this.lit.push(f);
  }

  /** Two flat hand outlines, palms down, each finger tinted like its keys. */
  private hands(): SVGSVGElement {
    const svg = svgEl('svg', { class: 'fg-hands', viewBox: '0 0 300 120', 'aria-hidden': 'true' });
    // Left hand, outer edge first; the right hand is its mirror image.
    const fingers: [FingerName, number, number, number][] = [
      ['pinky', 14, 34, 36], ['ring', 34, 16, 54], ['middle', 54, 8, 62], ['index', 74, 18, 52],
    ];
    for (const hand of ['left', 'right'] as const) {
      const g = svgEl('g', { transform: hand === 'left' ? 'translate(10 0)' : 'translate(290 0) scale(-1 1)' });
      // Thumb first, so the palm covers its base.
      const thumb = svgEl('rect', {
        class: `fg-finger fg-${hand}-thumb`, x: 86, y: 66, width: 18, height: 46, rx: 9, transform: 'rotate(38 95 112)',
      });
      this.fingerEls.set(`${hand}-thumb`, thumb);
      g.append(thumb);
      for (const [name, x, y, h] of fingers) {
        const f = svgEl('rect', { class: `fg-finger fg-${hand}-${name}`, x, y, width: 18, height: h, rx: 9 });
        this.fingerEls.set(`${hand}-${name}`, f);
        g.append(f);
      }
      g.append(svgEl('rect', { class: 'fg-palm', x: 12, y: 62, width: 82, height: 54, rx: 16 }));
      svg.append(g);
    }
    return svg;
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

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
