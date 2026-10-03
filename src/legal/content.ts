import { LEGAL_UPDATED, OWNER } from './owner';

/**
 * The Impressum and the privacy policy, in German and English.
 *
 * Written for a private, non-commercial site run from Austria: no ads, no
 * payment, no tracking. Practice data stays in the browser unless the
 * learner signs in to the optional account, which syncs it through Supabase
 * (EU, Frankfurt). Cloudflare delivers the files. If any of that changes
 * (analytics, ads, a donation button, another processor such as a mail
 * service), these texts have to change first.
 *
 * German is the binding version; the English text is a translation.
 */

export type LegalPage = 'imprint' | 'privacy';
export type LegalLanguage = 'de' | 'en';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const name = esc(OWNER.name);
const town = esc(OWNER.town);
const mail = `<a href="mailto:${esc(OWNER.email)}">${esc(OWNER.email)}</a>`;

/** Page chrome: titles, the back link and the language switch. */
export const LEGAL_UI = {
  de: {
    imprint: 'Impressum',
    privacy: 'Datenschutzerklärung',
    back: '← Zurück zum Training',
    language: 'Sprache',
    updated: `Stand: ${LEGAL_UPDATED.de}`,
    note: '',
  },
  en: {
    imprint: 'Legal notice (Impressum)',
    privacy: 'Privacy policy',
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
    <p>Keystrider braucht kein Konto und setzt keine Cookies. Es gibt keine Werbung, keine Analyse- oder Tracking-Dienste und keine eingebundenen Inhalte von Dritten, auch keine externen Schriftarten. Was du übst, bleibt in deinem Browser. Nur wenn du dich freiwillig anmeldest, um deinen Fortschritt zwischen Geräten abzugleichen, werden deine Übungsdaten auf einem Server in der EU gespeichert (siehe <em>Freiwilliges Konto</em>).</p>

    <h2>Verantwortlicher</h2>
    <p>${name}<br>${town}, Österreich<br>${mail}</p>

    <h2>Daten in deinem Browser</h2>
    <p>Damit das Training funktioniert und dein Fortschritt erhalten bleibt, speichert Keystrider auf deinem Gerät im lokalen Speicher deines Browsers (localStorage und IndexedDB):</p>
    <ul>
      <li><strong>Einstellungen:</strong> Tastaturlayout, Übungs- und Oberflächensprache, Farbschema, Hilfen beim Tippen, ob die Einrichtung abgeschlossen ist.</li>
      <li><strong>Lernstand:</strong> welche Tasten freigeschaltet sind und wie weit du im Lernpfad bist, je Sprache und Layout.</li>
      <li><strong>Tastenprotokoll:</strong> für jeden Anschlag im Übungstext das erwartete und das getippte Zeichen, die Taste, die Zeit seit dem vorigen Anschlag, Datum und Uhrzeit sowie die Übungsrunde. Daraus berechnet Keystrider deine schwachen Tasten und die nächsten Übungen. Erfasst wird nur, was du in das Übungsfeld tippst.</li>
    </ul>
    <p>Ohne Konto verlassen diese Daten dein Gerät nicht; wir erhalten sie nicht und können sie nicht einsehen. Wenn du angemeldet bist, liegen hier außerdem deine Anmeldung (ein Zugangsschlüssel, damit du angemeldet bleibst) und der Stand des letzten Abgleichs. Das Speichern ist technisch unbedingt erforderlich, um den Dienst bereitzustellen, den du ausdrücklich nutzt (§ 165 Abs. 3 TKG 2021); eine Einwilligung und ein Cookie-Banner sind dafür nicht nötig.</p>
    <p>Du behältst die Kontrolle: Unter <em>Einstellungen → Tastenprotokoll und Export</em> kannst du das Protokoll ansehen, als JSON oder CSV exportieren und löschen. Alles zusammen entfernst du, indem du in deinem Browser die Websitedaten für diese Seite löschst.</p>

    <h2>Freiwilliges Konto und Abgleich zwischen Geräten</h2>
    <p>Du kannst dich unter <em>Einstellungen → Konto</em> mit deinem Google-Konto oder mit E-Mail-Adresse und Passwort anmelden. Dann gleicht Keystrider deinen Fortschritt zwischen deinen Geräten ab. Dafür verarbeiten wir:</p>
    <ul>
      <li><strong>Anmeldedaten:</strong> deine E-Mail-Adresse, dein Passwort (nur als nicht umkehrbarer Hash gespeichert), eine interne Benutzerkennung, Zeitpunkt der Registrierung und der letzten Anmeldung sowie technische Protokolle der Anmeldung (IP-Adresse, Browserangaben, Zeitpunkt), die der Absicherung gegen Missbrauch dienen.</li>
      <li><strong>Benutzername:</strong> falls du einen wählst. Er wird in der App statt deiner E-Mail-Adresse angezeigt und ist für andere Nutzer nicht sichtbar.</li>
      <li><strong>Übungsdaten:</strong> das Tastenprotokoll jeder abgeschlossenen Übungsrunde (wie oben unter <em>Tastenprotokoll</em> beschrieben) und dein Lernstand je Sprache und Layout. Deine Einstellungen bleiben nur auf dem jeweiligen Gerät.</li>
    </ul>
    <p>Rechtsgrundlage ist die Erfüllung des Nutzungsverhältnisses, das du mit der Anmeldung eingehst (Art. 6 Abs. 1 lit. b DSGVO); die Anmeldeprotokolle verarbeiten wir aufgrund unseres berechtigten Interesses an einem sicheren Dienst (Art. 6 Abs. 1 lit. f DSGVO).</p>
    <p>Konto und Daten werden bei Supabase gespeichert (Supabase, Inc., USA), auf Servern in Frankfurt am Main (EU). Supabase verarbeitet die Daten als unser Auftragsverarbeiter auf Grundlage seines Auftragsverarbeitungsvertrags und verschickt auch E-Mails rund um dein Konto, etwa zum Zurücksetzen des Passworts. Soweit dabei ein Zugriff aus Ländern außerhalb der EU möglich ist, etwa durch Supabase selbst oder dessen Unterauftragsverarbeiter, ist er durch die EU-Standardvertragsklauseln abgesichert (Art. 46 Abs. 2 lit. c DSGVO). Mehr dazu in der <a href="https://supabase.com/privacy">Datenschutzerklärung von Supabase</a>.</p>
    <p>Wir speichern deine Daten, solange du dein Konto hast. Unter <em>Einstellungen → Konto → Konto löschen</em> löschst du dein Konto samt allen dort gespeicherten Übungsdaten sofort; die Daten auf deinem Gerät bleiben, bis du sie selbst löschst. Löschst du unter <em>Tastenprotokoll und Export</em> das Protokoll, während du angemeldet bist, wird es auch im Konto gelöscht. Anmeldeprotokolle löscht Supabase automatisch nach kurzer Zeit.</p>
    <p><strong>Anmeldung mit Google:</strong> Wählst du „Weiter mit Google“, wirst du zu Google weitergeleitet (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland) und meldest dich dort an. Google teilt uns danach deine E-Mail-Adresse, deinen Namen und die Adresse deines Profilbilds mit; wir verwenden nur die E-Mail-Adresse und speichern die übrigen Angaben nur, weil Supabase sie mit der Anmeldung ablegt. Für die Anmeldung bei Google ist Google selbst verantwortlich, siehe <a href="https://policies.google.com/privacy?hl=de">Datenschutzerklärung von Google</a>. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.</p>

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
    <p>Keystrider needs no account and sets no cookies. There are no ads, no analytics or tracking services and no embedded third-party content, not even external fonts. What you practise stays in your browser. Only if you choose to sign in, to keep your progress in sync between devices, is your practice data stored on a server in the EU (see <em>Optional account</em>).</p>

    <h2>Controller</h2>
    <p>${name}<br>${town}, Austria<br>${mail}</p>

    <h2>Data in your browser</h2>
    <p>So that training works and your progress is kept, Keystrider stores the following on your device, in your browser's local storage (localStorage and IndexedDB):</p>
    <ul>
      <li><strong>Settings:</strong> keyboard layout, practice and interface language, colour theme, typing aids, and whether setup is finished.</li>
      <li><strong>Learning state:</strong> which keys are unlocked and how far along the learning path you are, per language and layout.</li>
      <li><strong>Keystroke log:</strong> for each keystroke in the practice text, the expected and the typed character, the key, the time since the previous keystroke, the date and time, and the practice round. Keystrider uses it to work out your weak keys and your next drills. Only what you type into the practice field is recorded.</li>
    </ul>
    <p>Without an account this data does not leave your device; we do not receive it and cannot see it. When you are signed in, your sign-in (an access token, so you stay signed in) and the state of the last sync are stored here too. Storing it is strictly necessary to provide the service you explicitly use (§ 165(3) of the Austrian Telecommunications Act 2021, TKG 2021), so it needs no consent and no cookie banner.</p>
    <p>You stay in control: under <em>Settings → Keystroke log and export</em> you can view the log, export it as JSON or CSV, and delete it. To remove everything, clear this site's data in your browser.</p>

    <h2>Optional account and sync between devices</h2>
    <p>Under <em>Settings → Account</em> you can sign in with your Google account or with an e-mail address and password. Keystrider then keeps your progress in sync between your devices. For this we process:</p>
    <ul>
      <li><strong>Sign-in data:</strong> your e-mail address, your password (stored only as a one-way hash), an internal user ID, when you registered and last signed in, and technical sign-in logs (IP address, browser details, time) used to protect against abuse.</li>
      <li><strong>Username:</strong> if you choose one. The app shows it instead of your e-mail address; other users cannot see it.</li>
      <li><strong>Practice data:</strong> the keystroke log of each finished practice round (as described above under <em>Keystroke log</em>) and your learning state per language and layout. Your settings stay on each device.</li>
    </ul>
    <p>The legal basis is performing the service you sign up for (Art. 6(1)(b) GDPR); we process the sign-in logs based on our legitimate interest in a secure service (Art. 6(1)(f) GDPR).</p>
    <p>Accounts and data are stored with Supabase (Supabase, Inc., USA), on servers in Frankfurt am Main (EU). Supabase processes the data as our processor under its data processing agreement and also sends e-mails about your account, such as for resetting your password. Where access from outside the EU is possible, for example by Supabase itself or its sub-processors, it is covered by the EU Standard Contractual Clauses (Art. 46(2)(c) GDPR). See <a href="https://supabase.com/privacy">Supabase's privacy policy</a> for more.</p>
    <p>We keep your data for as long as you have your account. Under <em>Settings → Account → Delete account</em> you delete your account and all practice data stored with it at once; the data on your device stays until you delete it yourself. If you clear the log under <em>Keystroke log and export</em> while signed in, it is deleted from your account too. Supabase deletes sign-in logs automatically after a short time.</p>
    <p><strong>Signing in with Google:</strong> if you choose "Continue with Google", you are sent to Google (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland) to sign in there. Google then gives us your e-mail address, your name and the address of your profile picture; we only use the e-mail address and keep the rest only because Supabase stores it with the sign-in. Google is responsible for signing you in on its side, see <a href="https://policies.google.com/privacy">Google's privacy policy</a>. The legal basis is Art. 6(1)(b) GDPR.</p>

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

/** The body of a legal page as HTML. Only OWNER values are interpolated, and they are escaped. */
export function legalHtml(page: LegalPage, lang: LegalLanguage): string {
  return (page === 'imprint' ? imprint : privacy)[lang];
}
