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
- **Confirm email**: **aus**, solange es keinen eigenen Mailversand gibt (Schritt 6). Sonst bekommt jeder neue Nutzer eine Bestätigungsmail, die der eingebaute Versand nicht zustellt, und kann sich nie anmelden. Nachteil: Die E-Mail-Adresse wird nicht geprüft. Passwort vergessen geht in dieser Zeit auch nicht (braucht ebenfalls eine Mail), der Link ist in der App ausgeblendet.
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

## 5. Code in die Anmelde-E-Mail (später, mit Schritt 6)

Erst nötig, wenn Code-Login und „Passwort vergessen“ freigeschaltet werden (`EMAIL_LINKS` in `src/sync/account.ts`).

Projekt → **Authentication** → **Emails** → **Templates**. In **Magic Link** und in **Confirm signup** den Text ersetzen durch:

Betreff: `Dein Keystrider-Code: {{ .Token }}`

```html
<h2>Anmelden bei Keystrider</h2>
<p>Dein Code: <strong style="font-size: 1.4em; letter-spacing: 0.1em">{{ .Token }}</strong></p>
<p>Oder klick auf diesem Gerät hier: <a href="{{ .ConfirmationURL }}">Anmelden</a></p>
<p>Your sign-in code: <strong>{{ .Token }}</strong></p>
<p>Wenn du das nicht warst, ignoriere diese E-Mail.</p>
```

## 6. E-Mail-Versand für echte Nutzer (später, braucht eine Domain)

Der eingebaute Versand von Supabase schickt nur an Mitglieder deines Supabase-Teams und nur wenige Mails pro Stunde. Für alle anderen:

1. Domain registrieren.
2. Bei [Resend](https://resend.com) (kostenlos bis 3.000 Mails/Monat) die Domain hinzufügen und die angezeigten DNS-Einträge setzen.
3. Supabase (Produktion) → **Authentication** → **Emails** → **SMTP Settings** → **Enable custom SMTP**: Host `smtp.resend.com`, Port `465`, User `resend`, Passwort = Resend-API-Key, Absender z. B. `login@deine-domain`.
4. **Confirm email** (Schritt 3) wieder einschalten, Schritt 5 erledigen und in `src/sync/account.ts` `EMAIL_LINKS = true` setzen.
5. Datenschutzerklärung (`src/legal/content.ts`) um Resend als Auftragsverarbeiter ergänzen, im selben PR.

## 7. Sicherheit vor dem öffentlichen Start

Einmal in **beiden** Projekten prüfen (die Datenbank selbst ist über `supabase/migrations/` abgesichert):

- **Authentication** → **Sign In / Providers**: **Allow anonymous sign-ins** aus, **Minimum password length** `8` (Schritt 3). Die App verlangt 8 Zeichen, Supabase sonst nur 6, und wer die App umgeht, spricht direkt mit Supabase.
- **Authentication** → **URL Configuration**: nur die Adressen aus Schritt 2, keine weiteren Platzhalter. Kommt eine eigene Domain dazu, die alte workers.dev-Adresse erst entfernen, wenn niemand sie mehr nutzt.
- **Authentication** → **Rate Limits**: Standardwerte lassen (Anmelden und Registrieren 30 je 5 Minuten und IP-Adresse).
- **Advisors** → **Security Advisor**: sollte keine Fehler (rot) zeigen. Warnungen zu `username_available` und `buddy_invite` sind gewollt, die dürfen auch Abgemeldete aufrufen.
- **Project Settings** → **API Keys**: nur der *Publishable key* steht im Code. *Secret keys* und das Datenbank-Passwort nie in Code, Chat oder Screenshots; falls doch passiert: neu erzeugen.
- **Organization** → **Billing**: *Spend cap* bleibt an, damit keine Überraschungsrechnung kommt.
- Sobald es eigenen Mailversand gibt (Schritt 6): **Confirm email** einschalten. Bis dahin kann jemand ein Konto mit fremder E-Mail-Adresse anlegen, und meldet sich der echte Besitzer später mit Google an, kann Supabase ihn in dieses Konto führen.

## 8. Captcha gegen Massen-Registrierungen (Cloudflare Turnstile)

Anmelden, Registrieren, Anmeldecode und Passwort-Link mit E-Mail laufen dann über eine meist unsichtbare Prüfung. Google-Anmeldung ist nicht betroffen. Solange in `vite.config.ts` kein Site Key steht, ist alles aus. Die Reihenfolge ist wichtig, sonst kann sich niemand mehr mit E-Mail anmelden:

1. Cloudflare-Dashboard → **Turnstile** → **Add widget**: Name `keystrider`, **Hostname** `jeremiasz-kapek.workers.dev` (deckt auch die Vorschau-Adressen ab), später zusätzlich deine Domain. Für lokale Tests zusätzlich `localhost`. **Widget Mode**: *Managed*. **Pre-clearance**: *No*. **Create**.
2. Den **Site Key** in `vite.config.ts` bei `TURNSTILE` für `production` und `staging` eintragen (oder Claude schicken). Er ist öffentlich. Mergen und warten, bis Cloudflare neu gebaut hat. Erst dann erscheint auch der Turnstile-Absatz in der Datenschutzerklärung.
3. Den **Secret Key** in Supabase eintragen, zuerst Staging, nach einem Test Produktion: Projekt → **Authentication** → **Attack Protection** → **Enable Captcha protection** an → Provider **Turnstile by Cloudflare** → Secret Key → **Save**. Der Secret Key ist geheim: nicht in Code, Chat oder Screenshots.
4. Testen: abmelden, mit E-Mail und Passwort anmelden. Klappt es nicht, Schritt 3 wieder ausschalten.

Die Sicherheits-Header der Seite (Content-Security-Policy usw.) stehen in `public/_headers`. Kommt ein neuer Dienst dazu (z. B. Analytics oder Captcha), muss er dort und in der Datenschutzerklärung ergänzt werden.
