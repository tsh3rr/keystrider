import { LEGAL_UPDATED, OWNER } from './owner';

/**
 * The Impressum, the privacy policy and the terms of use, in German and English.
 *
 * Written for a private, non-commercial site run from Austria: no ads, no
 * payment, no tracking. Practice data stays in the browser unless the
 * learner signs in to the optional account, which syncs it through Supabase
 * (EU, Frankfurt). Cloudflare delivers the files and, once its site key is
 * set, Turnstile guards e-mail sign-in (the paragraph appears with it). If any of that changes
 * (analytics, ads, a donation button, another processor such as a mail
 * service), these texts have to change first.
 *
 * German is the binding version; the English text is a translation.
 */

export type LegalPage = 'imprint' | 'privacy' | 'terms';
export type LegalLanguage = 'de' | 'en';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const name = esc(OWNER.name);
const town = esc(OWNER.town);
const mail = `<a href="mailto:${esc(OWNER.email)}">${esc(OWNER.email)}</a>`;

/** Whether e-mail sign-in is behind Cloudflare Turnstile (see src/sync/captcha.ts). */
const CAPTCHA = __TURNSTILE_SITE_KEY__ !== '';

const captcha = {
  short: {
    de: CAPTCHA ? ' Einzige Ausnahme: Beim Anmelden und Registrieren mit E-Mail prüft Cloudflare Turnstile, dass ein Mensch das Formular abschickt (siehe <em>Schutz vor automatisierten Anmeldungen</em>).' : '',
    en: CAPTCHA ? ' The one exception: when you sign in or sign up with e-mail, Cloudflare Turnstile checks that a person is sending the form (see <em>Protection against automated sign-ups</em>).' : '',
  },
  section: {
    de: CAPTCHA ? `
    <p><strong>Schutz vor automatisierten Anmeldungen:</strong> Schickst du das Formular zum Anmelden, Registrieren, für einen Anmeldecode oder ein neues Passwort ab, prüft Cloudflare Turnstile (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA), ob ein Mensch es abschickt. Erst in diesem Moment lädt dein Browser ein Skript von Cloudflare. Es wertet technische Merkmale deines Browsers und Geräts sowie deine IP-Adresse aus; meist merkst du davon nichts, manchmal erscheint ein Kästchen zum Anklicken. Das Ergebnis, ein nur einmal gültiger Code, geht an Supabase, das ihn bei Cloudflare prüft. Laut Cloudflare werden diese Daten nicht für Werbung oder zum Wiedererkennen über Websites hinweg verwendet. Rechtsgrundlage ist unser berechtigtes Interesse, Konten und Datenbank vor Missbrauch durch automatisch angelegte Konten zu schützen (Art. 6 Abs. 1 lit. f DSGVO). Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert (Art. 45 DSGVO). Mehr dazu in der <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Datenschutzerklärung zu Turnstile</a>. Mit Google angemeldet läuft diese Prüfung nicht.</p>` : '',
    en: CAPTCHA ? `
    <p><strong>Protection against automated sign-ups:</strong> when you send the form to sign in, sign up, get a sign-in code or a new password, Cloudflare Turnstile (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA) checks whether a person is sending it. Only at that moment does your browser load a script from Cloudflare. It looks at technical features of your browser and device and at your IP address; usually you notice nothing, sometimes a box to tick appears. The result, a code that is valid only once, goes to Supabase, which checks it with Cloudflare. According to Cloudflare, this data is not used for advertising or to recognise you across websites. The legal basis is our legitimate interest in protecting accounts and the database from abuse by automatically created accounts (Art. 6(1)(f) GDPR). Cloudflare is certified under the EU-US Data Privacy Framework (Art. 45 GDPR). See the <a href="https://www.cloudflare.com/turnstile-privacy-policy/">Turnstile privacy policy</a> for more. Signing in with Google does not use this check.</p>` : '',
  },
};

/** Page chrome: titles, the back link and the language switch. */
export const LEGAL_UI = {
  de: {
    imprint: 'Impressum',
    privacy: 'Datenschutzerklärung',
    terms: 'Nutzungsbedingungen',
    back: '← Zurück zum Training',
    language: 'Sprache',
    updated: `Stand: ${LEGAL_UPDATED.de}`,
    note: '',
  },
  en: {
    imprint: 'Legal notice (Impressum)',
    privacy: 'Privacy policy',
    terms: 'Terms of use',
    back: '← Back to practice',
    language: 'Language',
    updated: `Last updated: ${LEGAL_UPDATED.en}`,
    note: 'This is a translation. The German version is the binding one.',
  },
} satisfies Record<LegalLanguage, Record<string, string>>;

const licenses = {
  de: `
    <h2>Quellen und Lizenzen</h2>
    <ul>
      <li>Die Übungswörter stammen aus <a href="https://github.com/rspeer/wordfreq">wordfreq</a> (Robyn Speer), Lizenz <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.de">CC BY-SA 4.0</a>. Die deutsche Rechtschreibung wurde mit den Worthäufigkeiten aus <a href="https://github.com/barrust/pyspellchecker">pyspellchecker</a> geprüft, die auf <a href="https://github.com/hermitdave/FrequencyWords">FrequencyWords</a> (Hermit Dave, CC BY-SA 4.0) beruhen. Die daraus erstellten Wortlisten stehen ebenfalls unter CC BY-SA 4.0.</li>
      <li>Der Filter für anstößige Wörter nutzt die <a href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words">List of Dirty, Naughty, Obscene, and Otherwise Bad Words</a>, Lizenz <a href="https://creativecommons.org/licenses/by/4.0/deed.de">CC BY 4.0</a>.</li>
    </ul>`,
  en: `
    <h2>Sources and licenses</h2>
    <ul>
      <li>Practice words come from <a href="https://github.com/rspeer/wordfreq">wordfreq</a> (Robyn Speer), licensed <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>. German spelling was checked against the word frequencies in <a href="https://github.com/barrust/pyspellchecker">pyspellchecker</a>, which are based on <a href="https://github.com/hermitdave/FrequencyWords">FrequencyWords</a> (Hermit Dave, CC BY-SA 4.0). The resulting word lists are under CC BY-SA 4.0 as well.</li>
      <li>The offensive-word filter uses the <a href="https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words">List of Dirty, Naughty, Obscene, and Otherwise Bad Words</a>, licensed <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.</li>
    </ul>`,
};

const imprint: Record<LegalLanguage, string> = {
  de: `
    <h2>Offenlegung gemäß § 25 Mediengesetz</h2>
    <p>Medieninhaber:<br>${name}<br>Wohnort: ${town}, Österreich</p>
    <p>Kontakt: ${mail}</p>
    <p>Inhalt der Website: Keystrider ist ein kostenloser Trainer für das Zehnfingersystem. Die Website ist ein privates, nicht kommerzielles Projekt ohne Werbung.</p>
    ${licenses.de}`,
  en: `
    <h2>Disclosure under § 25 of the Austrian Media Act (MedienG)</h2>
    <p>Media owner:<br>${name}<br>Place of residence: ${town}, Austria</p>
    <p>Contact: ${mail}</p>
    <p>About this website: Keystrider is a free touch-typing trainer. The website is a private, non-commercial project without advertising.</p>
    ${licenses.en}`,
};

const privacy: Record<LegalLanguage, string> = {
  de: `
    <h2>Kurz gesagt</h2>
    <p>Keystrider braucht kein Konto und setzt keine Cookies. Es gibt keine Werbung, keine Analyse- oder Tracking-Dienste und keine eingebundenen Inhalte von Dritten, auch keine externen Schriftarten.${captcha.short.de} Was du übst, bleibt in deinem Browser. Nur wenn du dich freiwillig anmeldest, um deinen Fortschritt zwischen Geräten abzugleichen, werden deine Übungsdaten auf einem Server in der EU gespeichert (siehe <em>Freiwilliges Konto</em>).</p>

    <h2>Verantwortlicher</h2>
    <p>${name}<br>${town}, Österreich<br>${mail}</p>

    <h2>Daten in deinem Browser</h2>
    <p>Damit das Training funktioniert und dein Fortschritt erhalten bleibt, speichert Keystrider auf deinem Gerät im lokalen Speicher deines Browsers (localStorage und IndexedDB):</p>
    <ul>
      <li><strong>Einstellungen:</strong> Tastaturlayout, Übungs- und Oberflächensprache, Farbschema, Hilfen beim Tippen, ob die Einrichtung abgeschlossen ist und ob du einen Hinweis weggeklickt hast, dein Wochenziel; falls du mehrere Tastaturen nutzt, deren Namen und Layouts und welche gerade gewählt ist.</li>
      <li><strong>Lernstand:</strong> welche Tasten freigeschaltet sind und welche du schon beherrschst, und wie weit du im Lernpfad bist, je Sprache und Layout.</li>
      <li><strong>Tastenprotokoll:</strong> für jeden Anschlag im Übungstext das erwartete und das getippte Zeichen, die Taste, die Zeit seit dem vorigen Anschlag, Datum und Uhrzeit sowie die Übungsrunde, und wenn du unter <em>Einstellungen → Tastaturen</em> mehrere Tastaturen angelegt hast, auf welcher davon. Daraus berechnet Keystrider deine schwachen Tasten und die nächsten Übungen. Erfasst wird nur, was du in das Übungsfeld tippst.</li>
    </ul>
    <p>Ohne Konto verlassen diese Daten dein Gerät nicht; wir erhalten sie nicht und können sie nicht einsehen. Wenn du angemeldet bist, liegen hier außerdem deine Anmeldung (ein Zugangsschlüssel, damit du angemeldet bleibst) und der Stand des letzten Abgleichs. Das Speichern ist technisch unbedingt erforderlich, um den Dienst bereitzustellen, den du ausdrücklich nutzt (§ 165 Abs. 3 TKG 2021); eine Einwilligung und ein Cookie-Banner sind dafür nicht nötig.</p>
    <p>Du behältst die Kontrolle: Unter <em>Einstellungen → Tastenprotokoll und Export</em> kannst du das Protokoll ansehen, als JSON oder CSV exportieren und löschen. Alles zusammen entfernst du, indem du in deinem Browser die Websitedaten für diese Seite löschst.</p>

    <h2>Freiwilliges Konto und Abgleich zwischen Geräten</h2>
    <p>Du kannst dich unter <em>Einstellungen → Konto</em> mit deinem Google-Konto oder mit E-Mail-Adresse und Passwort anmelden. Dann gleicht Keystrider deinen Fortschritt zwischen deinen Geräten ab. Dafür verarbeiten wir:</p>
    <ul>
      <li><strong>Anmeldedaten:</strong> deine E-Mail-Adresse, dein Passwort (nur als nicht umkehrbarer Hash gespeichert), eine interne Benutzerkennung, Zeitpunkt der Registrierung und der letzten Anmeldung sowie technische Protokolle der Anmeldung (IP-Adresse, Browserangaben, Zeitpunkt), die der Absicherung gegen Missbrauch dienen.</li>
      <li><strong>Benutzername:</strong> den du beim Registrieren wählst. Er wird in der App statt deiner E-Mail-Adresse angezeigt. Andere Nutzer sehen ihn nur, wenn du einer Gruppe von Trainingspartnern beitrittst (siehe unten); beim Registrieren lässt sich nur prüfen, ob ein Name schon vergeben ist.</li>
      <li><strong>Übungsdaten:</strong> das Tastenprotokoll jeder abgeschlossenen Übungsrunde (wie oben unter <em>Tastenprotokoll</em> beschrieben) und dein Lernstand je Sprache und Layout, außerdem Namen und Layouts deiner Tastaturen, falls du mehrere angelegt hast. Deine übrigen Einstellungen bleiben nur auf dem jeweiligen Gerät.</li>
    </ul>
    <p>Rechtsgrundlage ist die Erfüllung des Nutzungsverhältnisses, das du mit der Anmeldung eingehst (Art. 6 Abs. 1 lit. b DSGVO, siehe <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>); die Anmeldeprotokolle verarbeiten wir aufgrund unseres berechtigten Interesses an einem sicheren Dienst (Art. 6 Abs. 1 lit. f DSGVO).</p>
    <p>Konto und Daten werden bei Supabase gespeichert (Supabase, Inc., USA), auf Servern in Frankfurt am Main (EU). Supabase verarbeitet die Daten als unser Auftragsverarbeiter auf Grundlage seines Auftragsverarbeitungsvertrags und verschickt auch E-Mails rund um dein Konto, etwa zum Zurücksetzen des Passworts. Soweit dabei ein Zugriff aus Ländern außerhalb der EU möglich ist, etwa durch Supabase selbst oder dessen Unterauftragsverarbeiter, ist er durch die EU-Standardvertragsklauseln abgesichert (Art. 46 Abs. 2 lit. c DSGVO). Mehr dazu in der <a href="https://supabase.com/privacy">Datenschutzerklärung von Supabase</a>.</p>
    <p>Wir speichern deine Daten, solange du dein Konto hast. Unter <em>Einstellungen → Konto → Konto löschen</em> löschst du dein Konto samt allen dort gespeicherten Übungsdaten sofort; die Daten auf deinem Gerät bleiben, bis du sie selbst löschst. Löschst du unter <em>Tastenprotokoll und Export</em> das Protokoll, während du angemeldet bist, wird es auch im Konto gelöscht. Anmeldeprotokolle löscht Supabase automatisch nach kurzer Zeit.</p>
    <p><strong>Trainingspartner (freiwillig):</strong> Mit Konto kannst du eine kleine Gruppe gründen (bis zu 8 Personen) und Freunde per Einladungslink dazuholen. Die Mitglieder einer Gruppe sehen gegenseitig ihren Benutzernamen, ihr Wochenziel, an wie vielen Tagen sie in der laufenden Woche geübt haben, ihre Serie in Wochen und die Anfeuerungen (👏) der Woche; die durchschnittliche Tippgeschwindigkeit nur, wenn das jeweilige Mitglied sie freigibt. Dafür speichern wir die Gruppe, wer dazugehört, diese Wochenzahlen und die Anfeuerungen. Wer den Einladungslink hat, sieht vor dem Beitritt den Benutzernamen der Person, die die Gruppe gegründet hat, und wie viele Mitglieder sie hat. Dein Tastenprotokoll und deine E-Mail-Adresse sehen andere nie. Rechtsgrundlage ist die Erfüllung des Nutzungsverhältnisses, weil du diese Funktion ausdrücklich nutzt (Art. 6 Abs. 1 lit. b DSGVO). Wenn du die Gruppe verlässt, daraus entfernt wirst oder dein Konto löschst, werden deine Wochenzahlen und Anfeuerungen in dieser Gruppe sofort gelöscht.</p>
    <p><strong>Anmeldung mit Google:</strong> Wählst du „Weiter mit Google“, wirst du zu Google weitergeleitet (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland) und meldest dich dort an. Google teilt uns danach deine E-Mail-Adresse, deinen Namen und die Adresse deines Profilbilds mit; wir verwenden nur die E-Mail-Adresse und speichern die übrigen Angaben nur, weil Supabase sie mit der Anmeldung ablegt. Für die Anmeldung bei Google ist Google selbst verantwortlich, siehe <a href="https://policies.google.com/privacy?hl=de">Datenschutzerklärung von Google</a>. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.</p>${captcha.section.de}

    <h2>Hosting</h2>
    <p>Die Website wird über Cloudflare ausgeliefert (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA). Beim Aufruf verarbeitet Cloudflare technisch notwendige Daten, damit die Seite bei dir ankommt und vor Angriffen geschützt ist: deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse sowie Angaben deines Browsers wie Browsertyp und Betriebssystem. Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren und funktionierenden Website (Art. 6 Abs. 1 lit. f DSGVO).</p>
    <p>Cloudflare handelt dabei als unser Auftragsverarbeiter auf Grundlage seines Auftragsverarbeitungsvertrags. Eine Verarbeitung in den USA ist möglich; Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert, für das ein Angemessenheitsbeschluss der EU-Kommission besteht (Art. 45 DSGVO). Wir selbst werten keine Zugriffsprotokolle aus. Mehr dazu in der <a href="https://www.cloudflare.com/de-de/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.</p>

    <h2>Kontakt per E-Mail</h2>
    <p>Wenn du uns schreibst, verwenden wir deine E-Mail-Adresse und deine Nachricht nur, um dir zu antworten (Art. 6 Abs. 1 lit. f DSGVO). Wir löschen sie, sobald die Anfrage erledigt ist und keine gesetzliche Pflicht zur Aufbewahrung besteht.</p>

    <h2>Deine Rechte</h2>
    <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung, auf Datenübertragbarkeit und auf Widerspruch (Art. 15 bis 21 DSGVO). Schreib uns dazu einfach eine E-Mail. Wenn du meinst, dass wir deine Daten nicht rechtmäßig verarbeiten, kannst du dich bei der Österreichischen Datenschutzbehörde beschweren: Barichgasse 40–42, 1030 Wien, <a href="https://www.dsb.gv.at">www.dsb.gv.at</a>.</p>

    <h2>Änderungen</h2>
    <p>Wenn Keystrider neue Funktionen bekommt, die Daten verarbeiten, oder einen weiteren Dienstleister einsetzt, passen wir diese Erklärung vorher an.</p>`,
  en: `
    <h2>In short</h2>
    <p>Keystrider needs no account and sets no cookies. There are no ads, no analytics or tracking services and no embedded third-party content, not even external fonts.${captcha.short.en} What you practise stays in your browser. Only if you choose to sign in, to keep your progress in sync between devices, is your practice data stored on a server in the EU (see <em>Optional account</em>).</p>

    <h2>Controller</h2>
    <p>${name}<br>${town}, Austria<br>${mail}</p>

    <h2>Data in your browser</h2>
    <p>So that training works and your progress is kept, Keystrider stores the following on your device, in your browser's local storage (localStorage and IndexedDB):</p>
    <ul>
      <li><strong>Settings:</strong> keyboard layout, practice and interface language, colour theme, typing aids, whether setup is finished or a notice was dismissed, your weekly goal, and, if you use several keyboards, their names and layouts and which one is selected.</li>
      <li><strong>Learning state:</strong> which keys are unlocked and which you have mastered, and how far along the learning path you are, per language and layout.</li>
      <li><strong>Keystroke log:</strong> for each keystroke in the practice text, the expected and the typed character, the key, the time since the previous keystroke, the date and time, and the practice round, plus which keyboard you typed on if you set up several under <em>Settings → Keyboards</em>. Keystrider uses it to work out your weak keys and your next drills. Only what you type into the practice field is recorded.</li>
    </ul>
    <p>Without an account this data does not leave your device; we do not receive it and cannot see it. When you are signed in, your sign-in (an access token, so you stay signed in) and the state of the last sync are stored here too. Storing it is strictly necessary to provide the service you explicitly use (§ 165(3) of the Austrian Telecommunications Act 2021, TKG 2021), so it needs no consent and no cookie banner.</p>
    <p>You stay in control: under <em>Settings → Keystroke log and export</em> you can view the log, export it as JSON or CSV, and delete it. To remove everything, clear this site's data in your browser.</p>

    <h2>Optional account and sync between devices</h2>
    <p>Under <em>Settings → Account</em> you can sign in with your Google account or with an e-mail address and password. Keystrider then keeps your progress in sync between your devices. For this we process:</p>
    <ul>
      <li><strong>Sign-in data:</strong> your e-mail address, your password (stored only as a one-way hash), an internal user ID, when you registered and last signed in, and technical sign-in logs (IP address, browser details, time) used to protect against abuse.</li>
      <li><strong>Username:</strong> the one you choose when you sign up. The app shows it instead of your e-mail address. Other users only see it if you join a group of training buddies (see below); signing up only reveals whether a name is already taken.</li>
      <li><strong>Practice data:</strong> the keystroke log of each finished practice round (as described above under <em>Keystroke log</em>) and your learning state per language and layout, plus the names and layouts of your keyboards if you set up several. Your other settings stay on each device.</li>
    </ul>
    <p>The legal basis is performing the service you sign up for (Art. 6(1)(b) GDPR, see the <a href="/nutzungsbedingungen">terms of use</a>); we process the sign-in logs based on our legitimate interest in a secure service (Art. 6(1)(f) GDPR).</p>
    <p>Accounts and data are stored with Supabase (Supabase, Inc., USA), on servers in Frankfurt am Main (EU). Supabase processes the data as our processor under its data processing agreement and also sends e-mails about your account, such as for resetting your password. Where access from outside the EU is possible, for example by Supabase itself or its sub-processors, it is covered by the EU Standard Contractual Clauses (Art. 46(2)(c) GDPR). See <a href="https://supabase.com/privacy">Supabase's privacy policy</a> for more.</p>
    <p>We keep your data for as long as you have your account. Under <em>Settings → Account → Delete account</em> you delete your account and all practice data stored with it at once; the data on your device stays until you delete it yourself. If you clear the log under <em>Keystroke log and export</em> while signed in, it is deleted from your account too. Supabase deletes sign-in logs automatically after a short time.</p>
    <p><strong>Training buddies (optional):</strong> with an account you can start a small group (up to 8 people) and bring friends in with an invite link. Members of a group see each other's username, weekly goal, how many days they practised in the current week, their streak in weeks, and the week's cheers (👏); average typing speed only if that member chooses to share it. For this we store the group, who is in it, these weekly numbers and the cheers. Anyone with the invite link can see, before joining, the username of the person who started the group and how many members it has. Others never see your keystroke log or your e-mail address. The legal basis is performing the service, since you use this feature explicitly (Art. 6(1)(b) GDPR). When you leave the group, are removed from it or delete your account, your weekly numbers and cheers in that group are deleted at once.</p>
    <p><strong>Signing in with Google:</strong> if you choose "Continue with Google", you are sent to Google (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland) to sign in there. Google then gives us your e-mail address, your name and the address of your profile picture; we only use the e-mail address and keep the rest only because Supabase stores it with the sign-in. Google is responsible for signing you in on its side, see <a href="https://policies.google.com/privacy">Google's privacy policy</a>. The legal basis is Art. 6(1)(b) GDPR.</p>${captcha.section.en}

    <h2>Hosting</h2>
    <p>The website is delivered through Cloudflare (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA). When you open it, Cloudflare processes the technical data needed to get the page to you and to protect it from attacks: your IP address, the date and time, the address requested, and details your browser sends such as browser type and operating system. The legal basis is our legitimate interest in a secure, working website (Art. 6(1)(f) GDPR).</p>
    <p>Cloudflare acts as our processor under its data processing agreement. Processing in the USA is possible; Cloudflare is certified under the EU-US Data Privacy Framework, which is covered by an adequacy decision of the European Commission (Art. 45 GDPR). We do not analyse access logs ourselves. See <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</a> for more.</p>

    <h2>Contact by e-mail</h2>
    <p>If you write to us, we use your e-mail address and message only to answer you (Art. 6(1)(f) GDPR). We delete them once the request is dealt with, unless the law requires us to keep them.</p>

    <h2>Your rights</h2>
    <p>You have the right of access, rectification, erasure and restriction of processing, the right to data portability and the right to object (Art. 15 to 21 GDPR). Just send us an e-mail. If you believe we process your data unlawfully, you can complain to the Austrian Data Protection Authority (Datenschutzbehörde): Barichgasse 40–42, 1030 Vienna, <a href="https://www.dsb.gv.at">www.dsb.gv.at</a>.</p>

    <h2>Changes</h2>
    <p>If Keystrider gets new features that process data, or uses another service provider, we will update this policy first.</p>`,
};

/**
 * Short terms for a free, private, non-commercial site under Austrian law.
 * They mainly matter for accounts: username rules, what happens on abuse,
 * and limited liability. Written with care, but not checked by a lawyer.
 */
const terms: Record<LegalLanguage, string> = {
  de: `
    <h2>Kurz gesagt</h2>
    <p>Keystrider ist kostenlos und ein privates Projekt. Üben kannst du ohne Konto und ohne diese Bedingungen zu lesen. Legst du ein Konto an, gelten sie zusätzlich: Wähle einen anständigen Benutzernamen, geh fair mit anderen um und lass den Dienst in Ruhe arbeiten. Wer dagegen verstößt, kann gesperrt werden.</p>

    <h2>1. Anbieter und Geltung</h2>
    <p>Keystrider wird von ${name}, ${town}, Österreich, betrieben (Kontakt: ${mail}). Diese Bedingungen gelten für die Nutzung der Website und besonders für das freiwillige Konto. Mit der Registrierung erklärst du dich mit ihnen einverstanden. Bist du jünger als 14 Jahre, brauchst du für ein Konto die Zustimmung deiner Eltern.</p>

    <h2>2. Kostenloser Dienst ohne Garantie</h2>
    <p>Keystrider kostet nichts und enthält keine Werbung. Wir bemühen uns, dass alles funktioniert, können aber nicht versprechen, dass die Website immer erreichbar und fehlerfrei ist oder dass deine Daten nie verloren gehen. Funktionen können sich ändern oder wegfallen. Sichere wichtige Daten über <em>Einstellungen → Tastenprotokoll und Export</em>. Keystrider ist ein Übungswerkzeug und kein Gesundheitsangebot: Wenn dir beim Tippen Hände, Arme oder Nacken wehtun, mach eine Pause und lass dich bei anhaltenden Beschwerden ärztlich beraten.</p>

    <h2>3. Dein Konto</h2>
    <p>Ein Konto ist für eine Person gedacht. Halte dein Passwort geheim und gib dein Konto nicht weiter. Du kannst es jederzeit unter <em>Einstellungen → Konto → Konto löschen</em> selbst löschen.</p>

    <h2>4. Benutzernamen</h2>
    <p>Dein Benutzername ist für deine Trainingspartner sichtbar. Er darf nicht</p>
    <ul>
      <li>beleidigend, bedrohend, diskriminierend, sexuell, gewaltverherrlichend oder sonst anstößig sein,</li>
      <li>vorgeben, eine andere Person, Keystrider selbst oder eine Organisation zu sein,</li>
      <li>Namens-, Marken- oder andere Rechte Dritter verletzen,</li>
      <li>Werbung, Links oder persönliche Daten anderer enthalten.</li>
    </ul>
    <p>Ein automatischer Filter blockiert manche Namen, er erkennt aber nicht alles. Ob ein Name passt, entscheiden im Zweifel wir.</p>

    <h2>5. Fair bleiben</h2>
    <p>Lade nur Leute in eine Gruppe von Trainingspartnern ein, die das auch wollen, und belästige niemanden, auch nicht über Anfeuerungen. Nicht erlaubt ist außerdem, Konten automatisch anzulegen, Schutzmaßnahmen oder Grenzen zu umgehen, auf fremde Daten zuzugreifen, den Dienst zu überlasten oder ihn anders als vorgesehen zu nutzen. Wenn du Missbrauch bemerkst, schreib uns an ${mail}.</p>

    <h2>6. Sperren und Löschen bei Verstößen</h2>
    <p>Verstößt jemand gegen diese Bedingungen, können wir je nach Schwere einen Benutzernamen zurücksetzen, die Person aus Gruppen entfernen, das Konto vorübergehend sperren oder es löschen. Meistens melden wir uns vorher per E-Mail und geben dir Gelegenheit, dich zu äußern; bei schweren Verstößen oder Gefahr für andere oder den Dienst handeln wir sofort. Wenn du eine Sperre für falsch hältst, schreib uns.</p>

    <h2>7. Haftung</h2>
    <p>Da Keystrider unentgeltlich ist, haften wir nur für Schäden, die wir vorsätzlich oder grob fahrlässig verursachen. Für Personenschäden haften wir nach den gesetzlichen Bestimmungen. Für die Inhalte verlinkter Websites sind deren Betreiber verantwortlich.</p>

    <h2>8. Ende des Dienstes</h2>
    <p>Wir können Keystrider oder das Konto-Angebot einstellen. Konten löschen wir in diesem Fall frühestens 30 Tage nach einer Ankündigung per E-Mail, damit du deine Daten vorher exportieren kannst.</p>

    <h2>9. Änderungen dieser Bedingungen</h2>
    <p>Wir können diese Bedingungen ändern, etwa wenn neue Funktionen dazukommen. Wesentliche Änderungen kündigen wir Kontoinhabern vorher per E-Mail oder in der App an. Wenn du nicht einverstanden bist, kannst du dein Konto löschen.</p>

    <h2>10. Anwendbares Recht</h2>
    <p>Es gilt österreichisches Recht unter Ausschluss des UN-Kaufrechts und der Verweisungsnormen. Wenn du Verbraucher bist, behältst du den Schutz der zwingenden Bestimmungen des Landes, in dem du lebst.</p>`,
  en: `
    <h2>In short</h2>
    <p>Keystrider is free and a private project. You can practise without an account and without reading these terms. If you create an account, they apply as well: choose a decent username, treat others fairly and leave the service alone to do its job. Anyone who breaks these rules can be suspended.</p>

    <h2>1. Provider and scope</h2>
    <p>Keystrider is run by ${name}, ${town}, Austria (contact: ${mail}). These terms apply to using the website and in particular to the optional account. By signing up you agree to them. If you are under 14, you need your parents' permission for an account.</p>

    <h2>2. A free service without guarantees</h2>
    <p>Keystrider costs nothing and has no ads. We try to keep everything working, but cannot promise that the website is always available and free of errors, or that your data is never lost. Features may change or be removed. Keep a copy of important data via <em>Settings → Keystroke log and export</em>. Keystrider is a practice tool, not a health service: if your hands, arms or neck hurt while typing, take a break, and see a doctor if the pain persists.</p>

    <h2>3. Your account</h2>
    <p>An account is meant for one person. Keep your password secret and do not share your account. You can delete it yourself at any time under <em>Settings → Account → Delete account</em>.</p>

    <h2>4. Usernames</h2>
    <p>Your training buddies can see your username. It must not</p>
    <ul>
      <li>be insulting, threatening, discriminatory, sexual, glorify violence or be otherwise offensive,</li>
      <li>pretend to be another person, Keystrider itself or an organisation,</li>
      <li>infringe the name, trademark or other rights of others,</li>
      <li>contain advertising, links or other people's personal data.</li>
    </ul>
    <p>An automatic filter blocks some names, but it does not catch everything. When in doubt, we decide whether a name is acceptable.</p>

    <h2>5. Play fair</h2>
    <p>Only invite people into a group of training buddies who want to be there, and do not harass anyone, including through cheers. It is also not allowed to create accounts automatically, get around protections or limits, access other people's data, overload the service or use it in ways it is not meant for. If you notice abuse, write to us at ${mail}.</p>

    <h2>6. Suspension and deletion</h2>
    <p>If someone breaks these terms, depending on how serious it is, we may reset their username, remove them from groups, suspend the account for a while or delete it. Usually we contact you by e-mail first and give you a chance to respond; for serious breaches or where others or the service are at risk, we act straight away. If you think a suspension is wrong, write to us.</p>

    <h2>7. Liability</h2>
    <p>As Keystrider is free of charge, we are only liable for damage we cause intentionally or through gross negligence. Liability for personal injury follows the law. The operators of linked websites are responsible for their content.</p>

    <h2>8. End of the service</h2>
    <p>We may shut down Keystrider or the account service. In that case we delete accounts no sooner than 30 days after announcing it by e-mail, so you can export your data first.</p>

    <h2>9. Changes to these terms</h2>
    <p>We may change these terms, for example when new features are added. We announce significant changes to account holders in advance by e-mail or in the app. If you do not agree, you can delete your account.</p>

    <h2>10. Governing law</h2>
    <p>Austrian law applies, excluding the UN Convention on Contracts for the International Sale of Goods and conflict-of-law rules. If you are a consumer, you keep the protection of the mandatory laws of the country where you live.</p>`,
};

/** The body of a legal page as HTML. Only OWNER values are interpolated, and they are escaped. */
export function legalHtml(page: LegalPage, lang: LegalLanguage): string {
  return { imprint, privacy, terms }[page][lang];
}
