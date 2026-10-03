# Konten einrichten (Supabase)

Einmalige Schritte im Supabase- und GitHub-Dashboard, damit Anmeldung und Abgleich funktionieren.
Alles gilt für **beide** Supabase-Projekte: zuerst Staging, dann Produktion.

| | Staging | Produktion |
|---|---|---|
| Projekt-ID (Ref) | `dghypouxfnfcdvpylznt` | `ubjwlxcawxwrgolszlkz` |
| Wird verwendet von | lokaler Entwicklung, Vorschau-Builds aller anderen Branches | Builds von `main` |

Die App wählt das Projekt selbst (Cloudflare setzt beim Build `WORKERS_CI_BRANCH`, siehe `vite.config.ts`). In Cloudflare ist nichts einzustellen.

## 1. Datenbank-Tabellen anlegen (GitHub-Secrets)

Die Tabellen kommen aus `supabase/migrations/`. Der Workflow *Database migrations* spielt sie bei einem PR in Staging und nach dem Merge in Produktion ein, sobald diese Secrets gesetzt sind:

1. **Access Token** (einer für beide): supabase.com → rechts oben dein Avatar → **Account preferences** → **Access Tokens** → **Generate new token**, Name `github-keystrider`. Token kopieren.
2. **Datenbank-Passwort** je Projekt: Projekt öffnen → **Project Settings** (Zahnrad) → **Database** → **Reset database password**. Neues Passwort kopieren.
3. GitHub: `tsh3rr/keystrider` → **Settings** → **Environments** → `staging` (fehlt es: **New environment**) → **Environment secrets** → **Add environment secret**:
   - `SUPABASE_ACCESS_TOKEN` = Token aus Schritt 1
   - `SUPABASE_DB_PASSWORD` = Passwort des Staging-Projekts
   - `SUPABASE_PROJECT_ID` = `dghypouxfnfcdvpylznt`
4. Dasselbe für das Environment `production`, mit dem Produktions-Passwort und `ubjwlxcawxwrgolszlkz`.

Prüfen: GitHub → **Actions** → *Database migrations* → **Run workflow** (läuft gegen Produktion), oder auf den nächsten PR warten (Staging). Danach siehst du in Supabase unter **Table Editor** die Tabellen `practice_sessions` und `user_state`.

## 2. Anmelde-Adressen erlauben

Projekt → **Authentication** → **URL Configuration**:

- **Site URL**: die Adresse der Seite. Produktion: `https://keystrider.<DEIN-SUBDOMAIN>.workers.dev` (oder später deine Domain). Staging: dieselbe Adresse ist in Ordnung.
- **Redirect URLs** → **Add URL**:
  - Produktion: `https://keystrider.<DEIN-SUBDOMAIN>.workers.dev/**`
  - Staging: `https://*-keystrider.<DEIN-SUBDOMAIN>.workers.dev/**` (Vorschau-Builds) und `http://localhost:5173/**` (lokal)

## 3. Code in die Anmelde-E-Mail

Die App fragt nach einem Code, damit die Anmeldung auch klappt, wenn du die E-Mail auf einem anderen Gerät öffnest.

Projekt → **Authentication** → **Emails** → **Templates**. In **Magic Link** und in **Confirm signup** den Text ersetzen durch:

Betreff: `Dein Keystrider-Code: {{ .Token }}`

```html
<h2>Anmelden bei Keystrider</h2>
<p>Dein Code: <strong style="font-size: 1.4em; letter-spacing: 0.1em">{{ .Token }}</strong></p>
<p>Oder klick auf diesem Gerät hier: <a href="{{ .ConfirmationURL }}">Anmelden</a></p>
<p>Your sign-in code: <strong>{{ .Token }}</strong></p>
<p>Wenn du das nicht warst, ignoriere diese E-Mail.</p>
```

## 4. E-Mail-Versand für echte Nutzer (später, braucht eine Domain)

Der eingebaute Versand von Supabase schickt nur an Mitglieder deines Supabase-Teams und nur wenige Mails pro Stunde. Für alle anderen:

1. Domain registrieren.
2. Bei [Resend](https://resend.com) (kostenlos bis 3.000 Mails/Monat) die Domain hinzufügen und die angezeigten DNS-Einträge setzen.
3. Supabase (Produktion) → **Authentication** → **Emails** → **SMTP Settings** → **Enable custom SMTP**: Host `smtp.resend.com`, Port `465`, User `resend`, Passwort = Resend-API-Key, Absender z. B. `login@deine-domain`.
4. Datenschutzerklärung (`src/legal/content.ts`) um Resend als Auftragsverarbeiter ergänzen, im selben PR.
