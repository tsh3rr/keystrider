/**
 * Small pictures for the feature tiles on the landing pages, drawn in the
 * logo's style: keys with a front, a side and a top face in ember, magenta and
 * cobalt. Neutral parts take their colours from the page (landing.css), so the
 * pictures follow the light and dark theme. Same order as features.items in
 * content.ts.
 */

type Hue = 'ember' | 'magenta' | 'cobalt';

const FACES: Record<Hue, { front: string; side: string; top: string }> = {
  ember: { front: '#ea5f0b', side: '#b24100', top: '#ff9a58' },
  magenta: { front: '#ae33a2', side: '#7b1474', top: '#e270d4' },
  cobalt: { front: '#2a58c6', side: '#12348d', top: '#5d8df7' },
};

/** A key as in the logo; (x, y) is the top left of its front face. */
function key(x: number, y: number, w: number, h: number, hue: Hue, label = '', d = 7): string {
  const f = FACES[hue];
  const r = d * 0.7;
  const text = label
    ? `<text x="${x + w / 2}" y="${y + h / 2 + 5}" class="art-cap">${label}</text>`
    : '';
  return `<polygon points="${x + w},${y + h} ${x + w + d},${y + h - r} ${x + w + d},${y - r} ${x + w},${y}" fill="${f.side}"/>`
    + `<polygon points="${x},${y} ${x + w},${y} ${x + w + d},${y - r} ${x + d},${y - r}" fill="${f.top}"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f.front}"/>${text}`;
}

/** A flag of horizontal or vertical stripes, clipped to a rounded rectangle. */
function flag(id: string, x: number, y: number, colours: string[], vertical = false): string {
  const w = 22;
  const h = 15;
  const n = colours.length;
  const stripes = colours.map((c, i) => vertical
    ? `<rect x="${x + (w / n) * i}" y="${y}" width="${w / n + 0.2}" height="${h}" fill="${c}"/>`
    : `<rect x="${x}" y="${y + (h / n) * i}" width="${w}" height="${h / n + 0.2}" fill="${c}"/>`).join('');
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3"/></clipPath>`
    + `<g clip-path="url(#${id})">${stripes}</g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" class="art-flag"/>`;
}

const svg = (body: string): string =>
  `<svg class="lp-art" viewBox="0 0 200 100" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;

const languages = svg(
  // Two speech bubbles with the flags of the languages, over three keys with their own letters.
  `<path d="M22 8h62a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8H48l-10 9v-9h-16a8 8 0 0 1-8-8V16a8 8 0 0 1 8-8z" class="art-paper" stroke="#ea5f0b"/>`
  + flag('fl-de', 22, 19, ['#1a1a1a', '#dd0000', '#ffce00'])
  + flag('fl-fr', 46, 19, ['#0055a4', '#ffffff', '#ef4135'], true)
  + flag('fl-it', 70, 19, ['#009246', '#ffffff', '#ce2b37'], true)
  + `<path d="M118 14h54a8 8 0 0 1 8 8v20a8 8 0 0 1-8 8h-10v9l-10-9h-34a8 8 0 0 1-8-8V22a8 8 0 0 1 8-8z" class="art-paper" stroke="#2a58c6"/>`
  + flag('fl-es', 122, 25, ['#c60b1e', '#ffc400', '#ffc400', '#c60b1e'])
  + flag('fl-pl', 150, 25, ['#ffffff', '#dc143c'])
  + key(50, 66, 26, 26, 'ember', 'é')
  + key(86, 66, 26, 26, 'magenta', 'ä')
  + key(122, 66, 26, 26, 'cobalt', 'ł'),
);

const fingerGuide = svg(
  // A keyboard tinted by finger, faded where the learner knows the keys; the next key lit and ringed.
  [0, 1, 2].map((row) => [0, 1, 2, 3, 4, 5, 6].map((col) => {
    if (row === 1 && col === 3) return '';
    const zone = ['#ea5f0b', '#ae33a2', '#2a58c6', '#2a58c6', '#2a58c6', '#ae33a2', '#ea5f0b'][col];
    return `<rect x="${12 + row * 8 + col * 25}" y="${14 + row * 27}" width="22" height="22" rx="5" fill="${zone}" fill-opacity="${col === 0 || col === 6 ? 0.18 : 0.32}"/>`;
  }).join('')).join('')
  + `<rect x="${20 + 3 * 25 - 7}" y="34" width="38" height="36" rx="9" class="art-ring"/>`
  + key(20 + 3 * 25, 44, 22, 22, 'cobalt', 'f', 6)
  + `<rect x="${20 + 3 * 25 + 6}" y="61" width="10" height="2.2" rx="1.1" fill="#ffffff" opacity=".85"/>`,
);

const placement = svg(
  // The logo's three steps, with a jump from the first straight to the third.
  key(52, 72, 26, 20, 'ember', '', 9)
  + key(86, 52, 26, 40, 'magenta', '', 9)
  + key(120, 30, 26, 62, 'cobalt', '', 9)
  + `<path d="M66 60C70 14 112 2 132 20" class="art-jump"/>`
  + `<path d="M124 18l9 3 1-9" class="art-arrow"/>`
  + `<path d="M138 22V4" class="art-pole"/><path d="M138 4h14l-4 4 4 4h-14z" fill="#ea5f0b"/>`,
);

const progress = svg(
  // A chart that climbs, next to a heatmap of keys.
  `<rect x="18" y="12" width="104" height="78" rx="10" class="art-paper"/>`
  + `<path d="M30 76h80M30 58h80M30 40h80" class="art-grid"/>`
  + `<polyline points="30,74 46,66 62,68 78,50 94,44 110,26" class="art-chart"/>`
  + `<circle cx="110" cy="26" r="5" fill="#ae33a2"/>`
  + [[0.9, 'e'], [0.25, 'n'], [0.5, 'r'], [0.15, 's'], [0.7, 'ö'], [0.3, 't']].map(([o, ch], i) => {
    const x = 134 + (i % 2) * 26;
    const y = 18 + Math.floor(i / 2) * 26;
    return `<rect x="${x}" y="${y}" width="22" height="22" rx="5" fill="#ea5f0b" fill-opacity="${o}"/>`
      + `<text x="${x + 11}" y="${y + 15.5}" class="art-heat${Number(o) > 0.6 ? ' art-heat-on' : ''}">${ch}</text>`;
  }).join(''),
);

const weekly = svg(
  // A week in a calendar, four days practised.
  `<rect x="30" y="14" width="140" height="76" rx="10" class="art-paper"/>`
  + `<path d="M30 24a10 10 0 0 1 10-10h120a10 10 0 0 1 10 10v8H30z" fill="#2a58c6"/>`
  + `<path d="M58 8v12M142 8v12" class="art-pole"/>`
  + [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const cx = 46 + i * 18;
    const done = [0, 1, 3, 4].includes(i);
    const hue = ['#ea5f0b', '#ae33a2', '#2a58c6'][i % 3];
    return done
      ? `<circle cx="${cx}" cy="56" r="7.5" fill="${hue}"/><path d="M${cx - 3.5} 56l2.5 2.5 4.5-5" class="art-tick"/>`
      : `<circle cx="${cx}" cy="56" r="7" class="art-day"/>`;
  }).join('')
  + `<rect x="46" y="76" width="108" height="5" rx="2.5" class="art-key"/><rect x="46" y="76" width="62" height="5" rx="2.5" fill="#ae33a2"/>`,
);

const safe = svg(
  // A cloud with a shield, and the laptop and phone that pick up from it.
  `<path d="M70 58a16 16 0 0 1 4-31 24 24 0 0 1 45-6 18 18 0 0 1 25 15 12 12 0 0 1-2 22z" class="art-cloud"/>`
  + `<path d="M106 22l14 5v10c0 9-6 15-14 18-8-3-14-9-14-18V27z" fill="#2a58c6"/>`
  + `<path d="M100 38l4.5 4.5 8-9" class="art-tick"/>`
  + `<path d="M58 66l14-6M154 66l-14-6" class="art-link"/>`
  + `<rect x="18" y="64" width="50" height="30" rx="4" class="art-paper"/><rect x="23" y="69" width="40" height="20" rx="2" fill="#ae33a2" fill-opacity=".25"/>`
  + `<path d="M12 96h62" class="art-pole"/>`
  + `<rect x="150" y="60" width="22" height="36" rx="5" class="art-paper"/><rect x="154" y="65" width="14" height="24" rx="2" fill="#ea5f0b" fill-opacity=".3"/>`,
);

export const FEATURE_ART: readonly string[] = [languages, fingerGuide, placement, progress, weekly, safe];
