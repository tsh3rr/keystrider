import { describe, expect, it } from 'vitest';
import { COPY, LANDING_LANGUAGES, landingPath } from './content';
import { renderLanding, robotsTxt, sitemapXml } from './render';

const SITE = 'https://example.test';

describe('landing pages', () => {
  it.each(LANDING_LANGUAGES)('%s: its own language, canonical address and links to every translation', (lang) => {
    const html = renderLanding(lang, SITE);
    expect(html).toContain(`<html lang="${lang}">`);
    expect(html).toContain(`<link rel="canonical" href="${SITE}${landingPath(lang)}" />`);
    for (const l of LANDING_LANGUAGES) expect(html).toContain(`hreflang="${l}" href="${SITE}${landingPath(l)}"`);
    expect(html).toContain(`hreflang="x-default" href="${SITE}/"`);
    expect(html).toContain(`href="/app/?lang=${lang}"`);
  });

  it.each(LANDING_LANGUAGES)('%s: search snippet fits and the demo has lines to type', (lang) => {
    const c = COPY[lang];
    expect(c.title.length).toBeLessThanOrEqual(70);
    expect(c.description.length).toBeLessThanOrEqual(170);
    expect(c.demo.lines.length).toBeGreaterThan(0);
    for (const line of c.demo.lines) expect(line).toMatch(/^[^\n]+$/);
  });

  it('keeps text from closing the data block', () => {
    expect(renderLanding('en', SITE)).not.toMatch(/<script type="application\/(ld\+)?json"[^>]*>[^<]*<\/(?!script)/);
  });

  it('lists every page in the sitemap, and closes previews to search engines', () => {
    const xml = sitemapXml(SITE);
    for (const l of LANDING_LANGUAGES) expect(xml).toContain(`<loc>${SITE}${landingPath(l)}</loc>`);
    expect(robotsTxt(SITE, true)).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robotsTxt(SITE, false)).toContain('Disallow: /');
  });
});
