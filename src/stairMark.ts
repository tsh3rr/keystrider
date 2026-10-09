/**
 * The Keystrider stair mark (see the logo in app/index.html) as small inline SVGs
 * for the onboarding choices. Same geometry and ember → magenta → cobalt sweep
 * as the logo; `filled` keys are solid and the rest are only outlined, so
 * "I'm new" shows one step, "I can already type" two, "Keep my lessons" all three.
 */

const DEFS = '<defs><linearGradient id="{id}-f0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f66b17"/><stop offset="1" stop-color="#dd5400"/></linearGradient><linearGradient id="{id}-s0" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c14900"/><stop offset="1" stop-color="#a23a00"/></linearGradient><linearGradient id="{id}-t0" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffac73"/><stop offset="1" stop-color="#ff8940"/></linearGradient><linearGradient id="{id}-f1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ba3fad"/><stop offset="1" stop-color="#a22697"/></linearGradient><linearGradient id="{id}-s1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#891c80"/><stop offset="1" stop-color="#6e0d67"/></linearGradient><linearGradient id="{id}-t1" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#eb82dd"/><stop offset="1" stop-color="#d85dcb"/></linearGradient><linearGradient id="{id}-f2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3363d2"/><stop offset="1" stop-color="#214dba"/></linearGradient><linearGradient id="{id}-s2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#173d9d"/><stop offset="1" stop-color="#0c2b7e"/></linearGradient><linearGradient id="{id}-t2" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#6d9bfd"/><stop offset="1" stop-color="#4d7ff1"/></linearGradient></defs>';

/** Each key: side face, front face, top face, highlight line. */
const KEYS = [
  '<polygon points="29.53,90.00 39.53,83.00 37.15,65.00 27.15,72.00" fill="url(#{id}-s0)"/><polygon points="3.00,90.00 29.53,90.00 27.15,72.00 5.39,72.00" fill="url(#{id}-f0)"/><polygon points="5.39,72.00 27.15,72.00 37.15,65.00 15.39,65.00" fill="url(#{id}-t0)"/><line x1="5.99" y1="72.50" x2="26.75" y2="72.50" stroke="#ffdfc5" stroke-width="0.9" stroke-linecap="round"/>',
  '<polygon points="58.27,90.00 68.27,83.00 65.88,38.00 55.88,45.00" fill="url(#{id}-s1)"/><polygon points="31.73,90.00 58.27,90.00 55.88,45.00 34.12,45.00" fill="url(#{id}-f1)"/><polygon points="34.12,45.00 55.88,45.00 65.88,38.00 44.12,38.00" fill="url(#{id}-t1)"/><line x1="34.72" y1="45.50" x2="55.48" y2="45.50" stroke="#eab8e2" stroke-width="0.9" stroke-linecap="round"/>',
  '<polygon points="87.00,90.00 97.00,83.00 94.61,11.00 84.61,18.00" fill="url(#{id}-s2)"/><polygon points="60.47,90.00 87.00,90.00 84.61,18.00 62.85,18.00" fill="url(#{id}-f2)"/><polygon points="62.85,18.00 84.61,18.00 94.61,11.00 72.85,11.00" fill="url(#{id}-t2)"/><line x1="63.45" y1="18.50" x2="84.21" y2="18.50" stroke="#a3bbea" stroke-width="0.9" stroke-linecap="round"/>',
];

let seq = 0;

/** Turns a key's faces into outlines in that step's colour (see .stair-mark .ol-N). */
function outline(key: string, step: number): string {
  return key
    .replace(/<line[^>]*\/>/g, '')
    .replace(/fill="url\(#\{id\}-\w+\)"/g, `class="ol ol-${step}"`);
}

/** A three-key stair with the first `filled` keys solid; each copy gets its own gradient ids. */
export function stairMark(filled: 1 | 2 | 3): SVGSVGElement {
  const id = `ks-ob${++seq}`;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'stair-mark');
  svg.setAttribute('aria-hidden', 'true');
  const keys = KEYS.map((k, i) => (i < filled ? k : outline(k, i)));
  svg.innerHTML = (DEFS + keys.join('')).replaceAll('{id}', id);
  return svg;
}
