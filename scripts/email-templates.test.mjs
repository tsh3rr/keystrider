import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KINDS, LANGUAGES, TEXTS, html, subject, withConfigBlock } from './email-templates.mjs';
import { authConfig } from './push-email-templates.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('e-mail templates', () => {
  it('are up to date in supabase/ (run node scripts/email-templates.mjs)', () => {
    for (const kind of KINDS) expect(read(`supabase/templates/${kind}.html`)).toBe(html(kind));
    const config = read('supabase/config.toml');
    expect(withConfigBlock(config)).toBe(config);
  });

  it('have every text in every language', () => {
    const keys = (o) => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((s) => `${k}.${s}`) : [k])).sort();
    for (const lang of LANGUAGES) {
      expect(keys(TEXTS[lang])).toEqual(keys(TEXTS.en));
      for (const kind of KINDS) expect(TEXTS[lang][kind].subject).toContain('{{ .Token }}');
    }
  });

  it('show the code and the link, and choose the language from the account', () => {
    for (const kind of KINDS) {
      const body = html(kind);
      expect(body).toContain('{{ .Token }}');
      expect(body).toContain('href="{{ .ConfirmationURL }}"');
      expect(body.startsWith('{{ $l := or .Data.locale "en" }}')).toBe(true);
      expect(subject(kind).startsWith('{{ $l := or .Data.locale "en" }}')).toBe(true);
      for (const lang of LANGUAGES.filter((l) => l !== 'en')) expect(body).toContain(`eq $l "${lang}"`);
    }
  });

  it('balance their Go template blocks', () => {
    for (const kind of KINDS) {
      for (const src of [html(kind), subject(kind)]) {
        const opened = src.match(/\{\{ if /g)?.length ?? 0;
        expect(src.match(/\{\{ end \}\}/g)?.length ?? 0).toBe(opened);
      }
    }
  });
});

describe('pushing the templates', () => {
  it('sends templates and subjects, and the mail server only when Resend is set up', () => {
    const plain = authConfig({});
    expect(plain.mailer_templates_recovery_content).toBe(html('recovery'));
    expect(plain.mailer_subjects_magic_link).toBe(subject('magic_link'));
    expect(plain).not.toHaveProperty('smtp_host');
    expect(authConfig({ RESEND_API_KEY: 'key' })).not.toHaveProperty('smtp_host');
    const resend = authConfig({ RESEND_API_KEY: 'key', MAIL_FROM: 'login@example.org' });
    expect(resend).toMatchObject({ smtp_host: 'smtp.resend.com', smtp_port: '465', smtp_user: 'resend', smtp_pass: 'key', smtp_admin_email: 'login@example.org', smtp_sender_name: 'Keystrider' });
    // "Confirm email" stays a decision made by hand.
    expect(resend).not.toHaveProperty('mailer_autoconfirm');
  });
});
