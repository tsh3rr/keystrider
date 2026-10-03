// Points a hosted Supabase project's mail at Resend and sends Keystrider's
// e-mail templates, through the Management API. Run by the "Email templates"
// workflow; see docs/email-setup.md.
//
//   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_ID=… node scripts/push-email-templates.mjs
//   node scripts/push-email-templates.mjs --dry-run      shows what would change
//
// Needs RESEND_API_KEY and MAIL_FROM (e.g. login@your-domain); without them it
// does nothing, because Supabase's free plan only accepts templates once the
// project has its own mail server. It never touches "Confirm email": that is
// switched by hand, once mail arrives.

import { fileURLToPath } from 'node:url';
import { KINDS, html, subject } from './email-templates.mjs';

/** The mail server settings, or null until Resend is set up. */
export function smtpConfig(env) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) return null;
  return {
    smtp_host: 'smtp.resend.com',
    smtp_port: '465',
    smtp_user: 'resend',
    smtp_pass: env.RESEND_API_KEY,
    smtp_admin_email: env.MAIL_FROM,
    smtp_sender_name: env.MAIL_SENDER_NAME || 'Keystrider',
  };
}

/** The templates and the code settings they describe. */
export function templateConfig() {
  const config = {
    // Codes are six digits and last an hour, as the e-mails and the app's code field say.
    mailer_otp_length: 6,
    mailer_otp_exp: 3600,
  };
  for (const kind of KINDS) {
    config[`mailer_subjects_${kind}`] = subject(kind);
    config[`mailer_templates_${kind}_content`] = html(kind);
  }
  return config;
}

const keys = (config) => Object.keys(config).map((key) => (key === 'smtp_pass' ? `${key} (hidden)` : key)).join('\n  ');

async function main() {
  const smtp = smtpConfig(process.env);
  const templates = templateConfig();
  if (!smtp) {
    console.log('RESEND_API_KEY and MAIL_FROM are not set: nothing to do (see docs/email-setup.md).');
    return;
  }
  if (process.argv.includes('--dry-run')) {
    console.log(`Would change:\n  ${keys(smtp)}\n  ${keys(templates)}`);
    return;
  }
  const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_ID: project } = process.env;
  if (!token || !project) throw new Error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are needed');
  // The mail server first: Supabase refuses templates while the project uses its built-in one.
  for (const config of [smtp, templates]) {
    const res = await fetch(`https://api.supabase.com/v1/projects/${project}/config/auth`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`Supabase answered ${res.status}: ${await res.text()}`);
    console.log(`Updated ${project}:\n  ${keys(config)}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
