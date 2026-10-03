import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

/**
 * Supabase projects for accounts and sync. Both values are public by design
 * (they ship in the browser bundle); row-level security in the database is
 * what protects the data.
 */
const SUPABASE = {
  production: { url: 'https://ubjwlxcawxwrgolszlkz.supabase.co', key: 'sb_publishable_QnvlL5E5MkUhOZENBSrkdg_rUaim9ep' },
  staging: { url: 'https://dghypouxfnfcdvpylznt.supabase.co', key: 'sb_publishable_pSD1knxbPjl5ih5bqi0zog_bcDsSb_o' },
};

/**
 * Sign-in by e-mail code, password reset and the address check at sign-up,
 * per Supabase project. All of them send e-mail, so each stays off until
 * that project sends through its own mail server (docs/email-setup.md).
 * Also switches the paragraph about the mail service in the privacy policy.
 */
const EMAIL_LINKS = { production: false, staging: false };

export default defineConfig(({ mode }) => {
  // Cloudflare Workers Builds sets WORKERS_CI_BRANCH: main is production,
  // every other branch, local development and tests use staging.
  // VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY in .env.local override both,
  // VITE_EMAIL_LINKS=true|false overrides EMAIL_LINKS.
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const target = process.env.WORKERS_CI_BRANCH === 'main' ? 'production' : 'staging';
  const supabase = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_PUBLISHABLE_KEY
    ? { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_PUBLISHABLE_KEY }
    : SUPABASE[target];
  const emailLinks = env.VITE_EMAIL_LINKS ? env.VITE_EMAIL_LINKS === 'true' : EMAIL_LINKS[target];

  return {
    define: {
      __SUPABASE_URL__: JSON.stringify(supabase.url),
      __SUPABASE_KEY__: JSON.stringify(supabase.key),
      __EMAIL_LINKS__: JSON.stringify(emailLinks),
    },
    // Three pages: the app, and the Impressum and privacy policy, which must be
    // reachable by their own address (/impressum, /datenschutz).
    build: {
      rolldownOptions: {
        input: {
          main: resolve(import.meta.dirname, 'index.html'),
          impressum: resolve(import.meta.dirname, 'impressum.html'),
          datenschutz: resolve(import.meta.dirname, 'datenschutz.html'),
        },
      },
    },
  };
});
