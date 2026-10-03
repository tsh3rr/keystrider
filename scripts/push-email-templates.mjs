// Sends Keystrider's e-mail templates, and optionally the Resend mail server,
// to a hosted Supabase project through the Management API. Run by the
// "Email templates" workflow; see docs/email-setup.md.
//
//   SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_ID=… node scripts/push-email-templates.mjs
//   node scripts/push-email-templates.mjs --dry-run      shows what would change
//
// With RESEND_API_KEY and MAIL_FROM (e.g. login@your-domain) set, it also
// points the project's mail at Resend. It never touches "Confirm email":
// that is switched by hand, once mail arrives.

import { fileURLToPath } from 'node:url';
import { KINDS, html, subject } from './email-templates.mjs';

/** The auth settings to change, from the templates and the environment. */
export function authConfig(env) {
  const config = {
    // Codes are six digits and last an hour, as the e-mails and the app's code field say.
    mailer_otp_length: 6,
    mailer_otp_exp: 3600,
  };
  for (const kind of KINDS) {
    config[`mailer_subjects_${kind}`] = subject(kind);
    config[`mailer_templates_${kind}_content`] = html(kind);
  }
  if (env.RESEND_API_KEY && env.MAIL_FROM) {
    Object.assign(config, {
      smtp_host: 'smtp.resend.com',
      smtp_port: '465',
      smtp_user: 'resend',
      smtp_pass: env.RESEND_API_KEY,
      smtp_admin_email: env.MAIL_FROM,
      smtp_sender_name: env.MAIL_SENDER_NAME || 'Keystrider',
    });
  }
  return config;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const config = authConfig(process.env);
  const shown = Object.keys(config).map((key) => (key === 'smtp_pass' ? `${key} (hidden)` : key));
  if (dryRun) {
    console.log(`Would change:\n  ${shown.join('\n  ')}`);
    return;
  }
  const { SUPABASE_ACCESS_TOKEN: token, SUPABASE_PROJECT_ID: project } = process.env;
  if (!token || !project) throw new Error('SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_ID are needed');
  const res = await fetch(`https://api.supabase.com/v1/projects/${project}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(`Supabase answered ${res.status}: ${await res.text()}`);
  console.log(`Updated ${project}:\n  ${shown.join('\n  ')}`);
  if (!config.smtp_host) console.log('No RESEND_API_KEY / MAIL_FROM: the mail server was left as it is.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
