import { BRAND_MARK } from './brand.ts';
import { COPY, LANDING_LANGUAGES, landingPath, type LandingLanguage } from './content.ts';

/**
 * Builds the landing pages, the sitemap and robots.txt at build time (see the
 * landing plugin in vite.config.ts). The pages are plain HTML with all their
 * text in place, so search engines and link previews read them without
 * running any script; src/landing/main.ts only adds the typing demo.
 */

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON inside a <script> block: "<" escaped so text cannot close the block. */
const jsonBlock = (value: unknown): string => JSON.stringify(value).replace(/</g, '\\u003c');

export const appPath = (lang: LandingLanguage): string => `/app/?lang=${lang}`;

export function renderLanding(lang: LandingLanguage, site: string): string {
  const c = COPY[lang];
  const url = site + landingPath(lang);
  const app = appPath(lang);

  const alternates = LANDING_LANGUAGES.map((l) =>
    `<link rel="alternate" hreflang="${l}" href="${site}${landingPath(l)}" />`).join('\n    ');

  const structured = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'Keystrider',
      url,
      description: c.description,
      applicationCategory: 'EducationalApplication',
      operatingSystem: 'Any (web browser)',
      inLanguage: lang,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      inLanguage: lang,
      mainEntity: c.faq.items.map((f) => ({
        '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  const languageLinks = LANDING_LANGUAGES.map((l) =>
    `<a href="${landingPath(l)}" hreflang="${l}" lang="${l}"${l === lang ? ' aria-current="page"' : ''}>${esc(COPY[l].name)}</a>`).join('');

  const cards = (items: { title: string; text: string }[], cls: string) => items.map((i, n) =>
    `<li class="${cls}"><span class="lp-num" aria-hidden="true">${n + 1}</span><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></li>`).join('\n          ');

  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(c.title)}</title>
    <meta name="description" content="${esc(c.description)}" />
    <link rel="canonical" href="${url}" />
    ${alternates}
    <link rel="alternate" hreflang="x-default" href="${site}/" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Keystrider" />
    <meta property="og:title" content="${esc(c.hero.title)}" />
    <meta property="og:description" content="${esc(c.description)}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${site}/og.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="${c.ogLocale}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.ico?v=2" sizes="32x32" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=2" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png?v=2" />
    <link rel="manifest" href="/site.webmanifest" />
    <!-- Returning learners and sign-in or invite links go straight on to the trainer. -->
    <script src="/to-app.js"></script>
    <link rel="stylesheet" href="/src/style.css" />
    <link rel="stylesheet" href="/src/landing/landing.css" />
    <script type="application/ld+json">${jsonBlock(structured)}</script>
  </head>
  <body class="lp">
    <header class="topbar lp-top">
      <a class="brand" href="${landingPath(lang)}">${BRAND_MARK}<span class="brand-word">key<b>strider</b></span></a>
      <span class="spacer"></span>
      <details class="lp-lang">
        <summary aria-label="${esc(c.nav.languages)}"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 3 2.5 15 0 18M12 3c-2.5 3-2.5 15 0 18"/></svg>${esc(c.name)}</summary>
        <nav class="menu lp-lang-menu" aria-label="${esc(c.nav.languages)}">${languageLinks}</nav>
      </details>
      <a class="lp-signin" href="/app/?signin&amp;lang=${lang}">${esc(c.nav.signIn)}</a>
      <a class="lp-btn lp-btn-small" href="${app}">${esc(c.nav.open)}</a>
    </header>

    <main class="lp-main">
      <section class="lp-hero">
        <p class="lp-eyebrow">${esc(c.hero.eyebrow)}</p>
        <h1>${esc(c.hero.title)}</h1>
        <p class="lp-lead">${esc(c.hero.lead)}</p>

        <div id="lp-demo" class="lp-demo">
          <div class="lp-demo-head">
            <span id="lp-label">${esc(c.demo.label)}</span>
            <span id="lp-stats" class="lp-stats"></span>
          </div>
          <div class="text-wrap">
            <div id="lp-text" class="text lp-text" aria-hidden="true">${esc(c.demo.lines[0])}</div>
            <button id="lp-start" class="start-pill" type="button" hidden>${esc(c.demo.start)}</button>
          </div>
          <textarea id="lp-input" class="typing-input" aria-labelledby="lp-label" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"></textarea>
          <div id="lp-result" class="lp-result" role="status" hidden></div>
        </div>

        <div id="lp-cta" class="lp-cta">
          <span class="lp-arrow" aria-hidden="true"></span>
          <a id="lp-go" class="lp-btn" href="${app}"><span data-cta>${esc(c.hero.cta)}</span> <span aria-hidden="true">→</span></a>
          <p class="lp-note">${esc(c.hero.note)}</p>
        </div>
      </section>

      <section class="lp-section" aria-labelledby="lp-method">
        <h2 id="lp-method">${esc(c.method.title)}</h2>
        <p class="lp-intro">${esc(c.method.intro)}</p>
        <ol class="lp-grid lp-steps">
          ${cards(c.method.items, 'lp-card')}
        </ol>
      </section>

      <section class="lp-section" aria-labelledby="lp-features">
        <h2 id="lp-features">${esc(c.features.title)}</h2>
        <ul class="lp-grid lp-feats">
          ${c.features.items.map((i) => `<li class="lp-feat"><h3>${esc(i.title)}</h3><p>${esc(i.text)}</p></li>`).join('\n          ')}
        </ul>
      </section>

      <section class="lp-section lp-faq" aria-labelledby="lp-faq">
        <h2 id="lp-faq">${esc(c.faq.title)}</h2>
        ${c.faq.items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n        ')}
      </section>

      <section class="lp-final">
        <h2>${esc(c.final.title)}</h2>
        <p>${esc(c.final.text)}</p>
        <a class="lp-btn" href="${app}"><span data-cta>${esc(c.final.cta)}</span> <span aria-hidden="true">→</span></a>
      </section>
    </main>

    <footer class="site-foot lp-foot">
      <nav class="lp-foot-langs" aria-label="${esc(c.nav.languages)}">${languageLinks}</nav>
      <a href="/impressum">${esc(c.foot.imprint)}</a>
      <a href="/datenschutz">${esc(c.foot.privacy)}</a>
      <a href="/nutzungsbedingungen">${esc(c.foot.terms)}</a>
    </footer>

    <script type="application/json" id="lp-data">${jsonBlock({ ...c.demo, app, lang, continue: c.hero.continue })}</script>
    <script type="module" src="/src/landing/main.ts"></script>
  </body>
</html>
`;
}

/** Every landing page, each listing its translations (hreflang) for search engines. */
export function sitemapXml(site: string): string {
  const links = LANDING_LANGUAGES.map((l) =>
    `    <xhtml:link rel="alternate" hreflang="${l}" href="${site}${landingPath(l)}"/>`).join('\n');
  const urls = LANDING_LANGUAGES.map((l) => `  <url>
    <loc>${site}${landingPath(l)}</loc>
${links}
    <xhtml:link rel="alternate" hreflang="x-default" href="${site}/"/>
  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

/** Production is open to search engines; preview builds are not, so they never compete with it. */
export function robotsTxt(site: string, production: boolean): string {
  return production
    ? `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n`
    : 'User-agent: *\nDisallow: /\n';
}
