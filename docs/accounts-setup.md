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

Prüfen: GitHub → **Actions** → *Database migrations* → **Run workflow** (läuft gegen Produktion), oder auf den nächsten PR warten (Staging). Danach siehst du in Supabase unter **Table Editor** die Tabellen `practice_sessions`, `user_state` und `profiles`.

## 2. Anmelde-Adressen erlauben

Projekt → **Authentication** → **URL Configuration**:

- **Site URL**: die Adresse der Seite. Produktion: `https://keystrider.jeremiasz-kapek.workers.dev` (oder später deine Domain). Staging: dieselbe Adresse ist in Ordnung.
- **Redirect URLs** → **Add URL**:
  - Produktion: `https://keystrider.jeremiasz-kapek.workers.dev/**`
  - Staging: `https://*-keystrider.jeremiasz-kapek.workers.dev/**` (Vorschau-Builds) und `http://localhost:5173/**` (lokal)

## 3. E-Mail und Passwort

Projekt → **Authentication** → **Sign In / Providers** → **Email**:

- **Enable Email provider**: an
- **Confirm email**: **aus**, solange es keinen eigenen Mailversand gibt (Schritt 5). Sonst bekommt jeder neue Nutzer eine Bestätigungsmail, die der eingebaute Versand nicht zustellt, und kann sich nie anmelden. Nachteil: Die E-Mail-Adresse wird nicht geprüft. Passwort vergessen geht in dieser Zeit auch nicht (braucht ebenfalls eine Mail), der Link ist in der App ausgeblendet.
- **Minimum password length**: `8`
- **Save**

## 4. Google-Anmeldung (optional, später)

Der Knopf ist ausgeblendet, bis `OAUTH_PROVIDERS` in `src/sync/account.ts` `'google'` enthält.

Einmal in der Google Cloud Console, dann in beiden Supabase-Projekten:

1. [console.cloud.google.com](https://console.cloud.google.com) → oben Projektauswahl → **Neues Projekt** → Name `Keystrider` → **Erstellen**.
2. Menü → **APIs & Dienste** → **OAuth-Zustimmungsbildschirm** (heißt auch **Google Auth Platform**) → **Jetzt starten**:
   - App-Name `Keystrider`, Support-E-Mail: deine Adresse → **Weiter**
   - Zielgruppe: **Extern** → **Weiter**, Kontakt-E-Mail → **Weiter** → zustimmen → **Erstellen**
   - **Branding**: Startseite `https://keystrider.jeremiasz-kapek.workers.dev`, Datenschutzerklärung `…/datenschutz`, Nutzungsbedingungen leer lassen; unter **Autorisierte Domains** `supabase.co` und `workers.dev`-Adresse bzw. später deine Domain → **Speichern**
   - **Zielgruppe** → **App veröffentlichen** (Status „In Produktion“). Für E-Mail und Name braucht es keine Prüfung durch Google.
3. **Clients** → **Client erstellen** → Anwendungstyp **Webanwendung**, Name `Keystrider`:
   - **Autorisierte JavaScript-Quellen**: `https://keystrider.jeremiasz-kapek.workers.dev` und `http://localhost:5173`
   - **Autorisierte Weiterleitungs-URIs**: `https://ubjwlxcawxwrgolszlkz.supabase.co/auth/v1/callback` und `https://dghypouxfnfcdvpylznt.supabase.co/auth/v1/callback`
   - **Erstellen** → **Client-ID** und **Clientschlüssel** kopieren.
4. In **jedem** Supabase-Projekt: **Authentication** → **Sign In / Providers** → **Google** → **Enable Sign in with Google** an, Client-ID und Client Secret einfügen → **Save**.

## 5. E-Mail-Versand (später, braucht eine Domain)

Der eingebaute Versand von Supabase schickt nur an Mitglieder deines Supabase-Teams und nur wenige Mails pro Stunde. Anmelde-Codes, „Passwort vergessen“ und die Bestätigung der Adresse sind deshalb ausgeblendet (`EMAIL_LINKS` in `vite.config.ts`). Wie man sie mit Resend einschaltet, steht in [email-setup.md](email-setup.md).
