import { t } from './i18n';
import { ROWS, keyLabel } from './layouts';
import { HOME_KEYS, HOME_ROW, describeFinger, fingerFor, fingerId, guideFor, type FingerName } from './fingers';

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
  private moved: SVGElement[] = [];

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

    this.renderText();
  }

  /** Writes the text that depends on the app language; called again when it changes. */
  renderText(): void {
    const label = (code: string) => keyLabel(this.layout, code);
    const [left, right] = [HOME_ROW.slice(0, 4), HOME_ROW.slice(4)].map((codes) => codes.map(label).join(' '));
    this.homeEl.textContent = t('guide.home', { left, right, f: label('KeyF'), j: label('KeyJ') });
    for (const [code, k] of this.keyEls) {
      if (code === 'Space') k.textContent = t('guide.space');
      else if (code.startsWith('Shift')) k.textContent = t('guide.shift');
    }
    if (this.current !== undefined) this.show(this.current, !this.root.classList.contains('fg-faded'));
  }

  /**
   * Highlights the key for the next character, or clears the guide when there
   * is none. With `revealed` false the guide is dimmed and gives nothing away.
   */
  show(ch: string | undefined, revealed = true): void {
    this.current = ch;
    for (const k of this.lit) k.classList.remove('fg-next', 'fg-from', 'fg-hold');
    this.lit = [];
    for (const m of this.moved) m.style.transform = '';
    this.moved = [];
    this.root.classList.toggle('fg-faded', !revealed && ch !== undefined);
    if (ch === undefined) {
      this.captionEl.textContent = '';
      return;
    }
    if (!revealed) {
      this.captionEl.textContent = t('guide.fromMemory');
      return;
    }
    const g = guideFor(this.layout, ch);
    if (!g) {
      this.captionEl.textContent = t('guide.noHint', { ch });
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
      this.reach(fingerId(g.finger), g.code);
    }
    if (g.shift) this.lightFinger(g.shift === 'ShiftLeft' ? 'left-pinky' : 'right-pinky', 'fg-hold');

    const name = ch === ' ' ? t('guide.space') : keyLabel(this.layout, g.code);
    // A shifted symbol is named by its key too: "Shift + ß for ?" on German QWERTZ.
    const keys = !g.shift ? name : ch.toUpperCase() === name ? t('guide.shiftKey', { key: name }) : t('guide.shiftFor', { key: name, ch });
    let text = `${keys}: ${describeFinger(g.finger)}`;
    if (g.home) text += t('guide.reach', { key: keyLabel(this.layout, g.home) });
    if (g.shift) text += t(g.shift === 'ShiftLeft' ? 'guide.holdLeft' : 'guide.holdRight');
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

  /**
   * Moves the active finger a few units toward its key, so the hand shows the
   * direction of the reach (up for the top rows, sideways for T or Ü).
   */
  private reach(id: string, code: string): void {
    const mover = this.fingerEls.get(id)?.parentNode as SVGGElement | null | undefined;
    if (!mover) return;
    const at = keyPosition(code);
    const home = keyPosition(HOME_KEYS[id] ?? code);
    if (!at || !home) return;
    // Hand groups are drawn in left-hand coordinates; the right hand is mirrored.
    const dx = clamp((at.x - home.x) * 5, -8, 8) * (id.startsWith('right') ? -1 : 1);
    const dy = clamp((at.y - home.y) * 7, -14, 7);
    mover.style.transform = `translate(${dx}px, ${dy}px)`;
    this.moved.push(mover);
  }

  /** Two flat hand outlines, palms down; each finger fades from its key colour into the palm. */
  private hands(): SVGSVGElement {
    const svg = svgEl('svg', { class: 'fg-hands', viewBox: '0 -16 300 136', 'aria-hidden': 'true' });
    const defs = svgEl('defs', {});
    for (const name of ['pinky', 'ring', 'middle', 'index', 'thumb', 'active']) {
      const grad = svgEl('linearGradient', { id: `fg-grad-${name}`, x1: 0, y1: 0, x2: 0, y2: 1 });
      grad.append(
        svgEl('stop', { offset: '0', class: `fg-stop-${name}` }),
        svgEl('stop', { offset: '0.45', class: `fg-stop-${name}` }),
        svgEl('stop', { offset: '1', class: 'fg-stop-palm' }),
      );
      defs.append(grad);
    }
    svg.append(defs);
    // Left hand, outer edge first; the right hand is its mirror image.
    const fingers: [FingerName, number, number, number][] = [
      ['pinky', 14, 34, 40], ['ring', 34, 16, 58], ['middle', 54, 8, 66], ['index', 74, 18, 56],
    ];
    for (const hand of ['left', 'right'] as const) {
      const g = svgEl('g', { transform: hand === 'left' ? 'translate(10 0)' : 'translate(290 0) scale(-1 1)' });
      const finger = (name: FingerName, attrs: Record<string, string | number>) => {
        // The wrapper carries the reach movement, the rect its own shape and colour.
        const mover = svgEl('g', { class: 'fg-mover' });
        const f = svgEl('rect', { class: `fg-finger fg-${hand}-${name}`, width: 18, rx: 9, ...attrs });
        mover.append(f);
        this.fingerEls.set(`${hand}-${name}`, f);
        g.append(mover);
      };
      // The thumb's base dips into the palm from below.
      finger('thumb', { x: 86, y: 70, height: 46, transform: 'rotate(38 95 112)' });
      g.append(svgEl('rect', { class: 'fg-palm', x: 12, y: 62, width: 82, height: 54, rx: 16 }));
      // Fingers overlap the palm's top edge, so their gradient ends in the palm colour.
      for (const [name, x, y, h] of fingers) finger(name, { x, y, height: h });
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

// Horizontal start of each row in key widths, matching the .kb-row offsets.
const ROW_STAGGER = [0, 0.62, 0.73, 0.52];

/** Where a key sits on the keyboard, in key widths (x) and rows (y). */
function keyPosition(code: string): { x: number; y: number } | null {
  for (let r = 0; r < ROWS.length; r++) {
    const c = ROWS[r].indexOf(code);
    if (c >= 0) return { x: c + ROW_STAGGER[r], y: r };
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
