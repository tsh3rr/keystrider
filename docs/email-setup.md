# E-Mail einschalten (Resend)

Alles für Anmelde-Codes, „Passwort vergessen“ und die Bestätigung der E-Mail-Adresse ist im Code fertig, aber aus. Diese Liste schaltet es ein. Kosten: nur die Domain. Resend Free (3.000 Mails im Monat, 100 am Tag) stellt beim Limit den Versand ein und verrechnet nichts.

Reihenfolge: erst Staging (Vorschau-Builds) testen, dann Produktion.

## 1. Domain

- [ ] Domain registrieren, z. B. bei Cloudflare (dann sind DNS-Einträge mit einem Klick gesetzt).
- [ ] Optional: in Cloudflare die Domain als **Custom Domain** des Workers `keystrider` eintragen.

## 2. Resend

- [ ] Auf [resend.com](https://resend.com) ein kostenloses Konto anlegen.
- [ ] **Domains** → **Add Domain**: deine Domain, **Region: Ireland (eu-west-1)**. Die Datenschutzerklärung sagt „Server in der EU“, das muss stimmen.
- [ ] Die angezeigten DNS-Einträge (MX, SPF, DKIM) beim Domain-Anbieter setzen → **Verify DNS Records**, warten bis „Verified“. Empfohlen zusätzlich: TXT `_dmarc` = `v=DMARC1; p=none;`
- [ ] In der Domain unter **Configuration**: **Click Tracking** und **Open Tracking** aus. (Die Datenschutzerklärung sagt, dass beides aus ist; Klick-Tracking würde außerdem die Anmeldelinks umschreiben.)
- [ ] **API Keys** → **Create API Key**: Name `supabase`, Permission **Sending access**, nur deine Domain. Schlüssel kopieren (wird nur einmal gezeigt).
- [ ] Den Auftragsverarbeitungsvertrag ansehen: [resend.com/legal/dpa](https://resend.com/legal/dpa). Prüfen, ob er automatisch gilt oder unterschrieben werden muss.

## 3. GitHub: Vorlagen und Mailserver in die Supabase-Projekte

Der Workflow *Email templates* stellt Supabase auf den Resend-Server um und schickt die Vorlagen aus `supabase/templates` (sechs Sprachen). Vorher tut er nichts: Im kostenlosen Supabase-Tarif lassen sich die Vorlagen erst mit eigenem Mailserver ändern.

- [ ] `tsh3rr/keystrider` → **Settings** → **Environments** → `staging`:
  - **Environment secrets** → `RESEND_API_KEY` = Schlüssel aus Schritt 2
  - **Environment variables** → `MAIL_FROM` = z. B. `login@deine-domain`
- [ ] Dasselbe für `production`.
- [ ] **Actions** → *Email templates* → **Run workflow** → `staging`. Dann noch einmal mit `production`.
- [ ] Prüfen in Supabase → **Authentication** → **Emails**: unter **SMTP Settings** steht `smtp.resend.com`, unter **Templates** die Keystrider-Vorlagen.

Ohne GitHub geht es auch von Hand: **SMTP Settings** → **Enable custom SMTP**, Host `smtp.resend.com`, Port `465`, User `resend`, Passwort = API-Key, Absender `login@deine-domain`, Name `Keystrider`. Vorlagen: Inhalt von `supabase/templates/*.html` und die Betreffzeilen aus `supabase/config.toml` einfügen.

## 4. Supabase (zuerst Staging, nach dem Test Produktion)

- [ ] **Authentication** → **URL Configuration**: **Site URL** = `https://deine-domain`, unter **Redirect URLs** `https://deine-domain/**` ergänzen (die `workers.dev`-Einträge dürfen bleiben).
- [ ] **Authentication** → **Rate Limits**: „Emails sent per hour“ z. B. auf `30` (Resend Free schafft 100 am Tag).
- [ ] **Authentication** → **Sign In / Providers** → **Email** → **Confirm email** **an** → **Save**. Wer sich bisher registriert hat, gilt schon als bestätigt und merkt nichts.

## 5. App umschalten

In `vite.config.ts` steht `EMAIL_LINKS = { production: false, staging: false }`. Der Schalter macht in der App „Mit Code anmelden“, „Passwort vergessen?“ und die Code-Eingabe nach der Registrierung sichtbar und schaltet in der Datenschutzerklärung den Absatz zu Resend ein.

- [ ] `staging: true` setzen, als PR. Im Vorschau-Build testen (nutzt Staging):
  - Konto mit echter Adresse anlegen → Mail kommt, Code eingeben → angemeldet
  - Abmelden → „Stattdessen mit Code per E-Mail anmelden“ → Code kommt → angemeldet
  - „Passwort vergessen?“ → Code → neues Passwort wählen
  - Oberfläche auf Polnisch stellen, einmal synchronisieren (App neu laden), dann „Passwort vergessen?“ → Mail kommt auf Polnisch
  - `/datenschutz` zeigt den Absatz „E-Mail-Versand“
- [ ] Schritt 4 für Produktion, dann `production: true` setzen, als PR, mergen.

Sag einfach Bescheid („E-Mail einschalten, Domain ist …“), dann mache ich Schritt 5 und passe die Adressen in den Anleitungen an.
