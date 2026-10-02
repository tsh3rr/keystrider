import { LEGAL_UPDATED, OWNER } from './owner';

/**
 * The Impressum and the privacy policy, in German and English.
 *
 * Written for a private, non-commercial site run from Austria: no ads, no
 * payment, no accounts, no tracking. Practice data stays in the browser, and
 * the only server is Cloudflare delivering the files. If any of that
 * changes (accounts and sync, analytics, ads, a donation button), these
 * texts have to change first.
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
    <p>Keystrider braucht kein Konto und setzt keine Cookies. Es gibt keine Werbung, keine Analyse- oder Tracking-Dienste und keine eingebundenen Inhalte von Dritten, auch keine externen Schriftarten. Was du übst, bleibt in deinem Browser und wird nicht an uns übertragen.</p>

    <h2>Verantwortlicher</h2>
    <p>${name}<br>${town}, Österreich<br>${mail}</p>

    <h2>Daten in deinem Browser</h2>
    <p>Damit das Training funktioniert und dein Fortschritt erhalten bleibt, speichert Keystrider auf deinem Gerät im lokalen Speicher deines Browsers (localStorage und IndexedDB):</p>
    <ul>
      <li><strong>Einstellungen:</strong> Tastaturlayout, Übungs- und Oberflächensprache, Farbschema, Hilfen beim Tippen, ob die Einrichtung abgeschlossen ist.</li>
      <li><strong>Lernstand:</strong> welche Tasten freigeschaltet sind und wie weit du im Lernpfad bist, je Sprache und Layout.</li>
      <li><strong>Tastenprotokoll:</strong> für jeden Anschlag im Übungstext das erwartete und das getippte Zeichen, die Taste, die Zeit seit dem vorigen Anschlag, Datum und Uhrzeit sowie die Übungsrunde. Daraus berechnet Keystrider deine schwachen Tasten und die nächsten Übungen. Erfasst wird nur, was du in das Übungsfeld tippst.</li>
    </ul>
    <p>Diese Daten verlassen dein Gerät nicht. Wir erhalten sie nicht und können sie nicht einsehen. Das Speichern ist technisch unbedingt erforderlich, um den Dienst bereitzustellen, den du ausdrücklich nutzt (§ 165 Abs. 3 TKG 2021); eine Einwilligung und ein Cookie-Banner sind dafür nicht nötig.</p>
    <p>Du behältst die Kontrolle: Unter <em>Einstellungen → Tastenprotokoll und Export</em> kannst du das Protokoll ansehen, als JSON oder CSV exportieren und löschen. Alles zusammen entfernst du, indem du in deinem Browser die Websitedaten für diese Seite löschst.</p>

    <h2>Hosting</h2>
    <p>Die Website wird über Cloudflare ausgeliefert (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA). Beim Aufruf verarbeitet Cloudflare technisch notwendige Daten, damit die Seite bei dir ankommt und vor Angriffen geschützt ist: deine IP-Adresse, Datum und Uhrzeit, die aufgerufene Adresse sowie Angaben deines Browsers wie Browsertyp und Betriebssystem. Rechtsgrundlage ist unser berechtigtes Interesse an einer sicheren und funktionierenden Website (Art. 6 Abs. 1 lit. f DSGVO).</p>
    <p>Cloudflare handelt dabei als unser Auftragsverarbeiter auf Grundlage seines Auftragsverarbeitungsvertrags. Eine Verarbeitung in den USA ist möglich; Cloudflare ist nach dem EU-US Data Privacy Framework zertifiziert, für das ein Angemessenheitsbeschluss der EU-Kommission besteht (Art. 45 DSGVO). Wir selbst werten keine Zugriffsprotokolle aus. Mehr dazu in der <a href="https://www.cloudflare.com/de-de/privacypolicy/">Datenschutzerklärung von Cloudflare</a>.</p>

    <h2>Kontakt per E-Mail</h2>
    <p>Wenn du uns schreibst, verwenden wir deine E-Mail-Adresse und deine Nachricht nur, um dir zu antworten (Art. 6 Abs. 1 lit. f DSGVO). Wir löschen sie, sobald die Anfrage erledigt ist und keine gesetzliche Pflicht zur Aufbewahrung besteht.</p>

    <h2>Deine Rechte</h2>
    <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung und Einschränkung der Verarbeitung, auf Datenübertragbarkeit und auf Widerspruch (Art. 15 bis 21 DSGVO). Schreib uns dazu einfach eine E-Mail. Wenn du meinst, dass wir deine Daten nicht rechtmäßig verarbeiten, kannst du dich bei der Österreichischen Datenschutzbehörde beschweren: Barichgasse 40–42, 1030 Wien, <a href="https://www.dsb.gv.at">www.dsb.gv.at</a>.</p>

    <h2>Änderungen</h2>
    <p>Derzeit gibt es keine Benutzerkonten. Sollte Keystrider später ein freiwilliges Konto anbieten, etwa um deinen Fortschritt zwischen Geräten abzugleichen, passen wir diese Erklärung vorher an.</p>`,
  en: `
    <h2>In short</h2>
    <p>Keystrider needs no account and sets no cookies. There are no ads, no analytics or tracking services and no embedded third-party content, not even external fonts. What you practise stays in your browser and is not sent to us.</p>

    <h2>Controller</h2>
    <p>${name}<br>${town}, Austria<br>${mail}</p>

    <h2>Data in your browser</h2>
    <p>So that training works and your progress is kept, Keystrider stores the following on your device, in your browser's local storage (localStorage and IndexedDB):</p>
    <ul>
      <li><strong>Settings:</strong> keyboard layout, practice and interface language, colour theme, typing aids, and whether setup is finished.</li>
      <li><strong>Learning state:</strong> which keys are unlocked and how far along the learning path you are, per language and layout.</li>
      <li><strong>Keystroke log:</strong> for each keystroke in the practice text, the expected and the typed character, the key, the time since the previous keystroke, the date and time, and the practice round. Keystrider uses it to work out your weak keys and your next drills. Only what you type into the practice field is recorded.</li>
    </ul>
    <p>This data does not leave your device. We do not receive it and cannot see it. Storing it is strictly necessary to provide the service you explicitly use (§ 165(3) of the Austrian Telecommunications Act 2021, TKG 2021), so it needs no consent and no cookie banner.</p>
    <p>You stay in control: under <em>Settings → Keystroke log and export</em> you can view the log, export it as JSON or CSV, and delete it. To remove everything, clear this site's data in your browser.</p>

    <h2>Hosting</h2>
    <p>The website is delivered through Cloudflare (Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA). When you open it, Cloudflare processes the technical data needed to get the page to you and to protect it from attacks: your IP address, the date and time, the address requested, and details your browser sends such as browser type and operating system. The legal basis is our legitimate interest in a secure, working website (Art. 6(1)(f) GDPR).</p>
    <p>Cloudflare acts as our processor under its data processing agreement. Processing in the USA is possible; Cloudflare is certified under the EU-US Data Privacy Framework, which is covered by an adequacy decision of the European Commission (Art. 45 GDPR). We do not analyse access logs ourselves. See <a href="https://www.cloudflare.com/privacypolicy/">Cloudflare's privacy policy</a> for more.</p>

    <h2>Contact by e-mail</h2>
    <p>If you write to us, we use your e-mail address and message only to answer you (Art. 6(1)(f) GDPR). We delete them once the request is dealt with, unless the law requires us to keep them.</p>

    <h2>Your rights</h2>
    <p>You have the right of access, rectification, erasure and restriction of processing, the right to data portability and the right to object (Art. 15 to 21 GDPR). Just send us an e-mail. If you believe we process your data unlawfully, you can complain to the Austrian Data Protection Authority (Datenschutzbehörde): Barichgasse 40–42, 1030 Vienna, <a href="https://www.dsb.gv.at">www.dsb.gv.at</a>.</p>

    <h2>Changes</h2>
    <p>There are no user accounts at the moment. If Keystrider later offers an optional account, for example to sync your progress between devices, we will update this policy first.</p>`,
};

/** The body of a legal page as HTML. Only OWNER values are interpolated, and they are escaped. */
export function legalHtml(page: LegalPage, lang: LegalLanguage): string {
  return (page === 'imprint' ? imprint : privacy)[lang];
}
