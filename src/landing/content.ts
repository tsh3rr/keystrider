/**
 * Text of the landing pages, one per interface language. Each page is its own
 * address (/, /de/, /es/, …) so search engines can show it to people searching
 * in that language; render.ts turns this into static HTML at build time.
 *
 * Only claim what the app does: the method points mirror the "How it works"
 * step of the first-run setup (onboarding.method* in the locale files), and
 * the privacy cards the privacy policy (src/legal/content.ts).
 */

export const LANDING_LANGUAGES = ['en', 'de', 'es', 'fr', 'it', 'pl'] as const;
export type LandingLanguage = (typeof LANDING_LANGUAGES)[number];

/** Address of a landing page; English is the site's front page. */
export const landingPath = (lang: LandingLanguage): string => (lang === 'en' ? '/' : `/${lang}/`);

interface Item { title: string; text: string }

export interface LandingCopy {
  /** The language named in itself, for the language links. */
  name: string;
  /** Open Graph locale, e.g. de_DE. */
  ogLocale: string;
  /** Search result title, about 60 characters. */
  title: string;
  /** Search result snippet, about 155 characters. */
  description: string;
  /** `sections` labels the in-page links (method, features, faq); `skip` is the skip link. */
  nav: { languages: string; signIn: string; open: string; sections: string; method: string; features: string; faq: string; skip: string };
  /**
   * `continue` replaces `cta` for someone who has practised in this browser before.
   * `rotate`: more headlines the hero types out in turn after `title` (main.ts).
   */
  hero: { eyebrow: string; title: string; rotate: string[]; lead: string; cta: string; continue: string; note: string };
  demo: {
    label: string;
    start: string;
    /** Label above the result, in place of `label`. */
    result: string;
    /** Short (live counter) and long (under the big number in the result). */
    wpm: string;
    wpmLong: string;
    accuracy: string;
    slowTitle: string;
    slowNone: string;
    /** After the line: lesson 1 comes next (a beginner, see handoff.ts). */
    nextBeginner: string;
    ctaBeginner: string;
    /** ... or the rest of the placement test, {n} words, to skip ahead. */
    nextFast: string;
    ctaFast: string;
    again: string;
    /** Practice lines for the hero; one is picked at random. Plain text, no line breaks. */
    lines: string[];
  };
  facts: { label: string; items: { value: string; label: string }[] };
  method: { eyebrow: string; title: string; intro: string; items: Item[] };
  /** What is measured, next to an example table of weak keys (`example`: keys, weakest first, and the drill's focus). */
  analysis: {
    eyebrow: string;
    title: string;
    text: string;
    points: { chip: string; strong: string; text: string }[];
    tableTitle: string;
    tableNote: string;
    columns: [string, string, string];
    nextPrefix: string;
    nextSuffix: string;
    example: { keys: string[]; focus: string[] };
  };
  features: { eyebrow: string; title: string; items: Item[] };
  /**
   * Text inside the feature pictures (render.ts, main.ts).
   * `layouts`: captions for the QWERTZ, AZERTY, QWERTY and Dvorak tabs.
   * `fingerWord`: typed letter by letter on one row of the page's layout.
   * `skipped`: plural forms by Intl.PluralRules category, with {n}.
   */
  vignettes: {
    layouts: [string, string, string, string];
    fingerWord: string;
    letters: string;
    placing: string;
    skipped: Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
    speed: string;
    weekGoal: string;
    lesson: string;
    laptop: string;
    tablet: string;
    stored: string;
  };
  privacy: { eyebrow: string; title: string; intro: string; items: (Item & { chips: [string, string] })[] };
  faq: { title: string; items: { q: string; a: string }[] };
  final: { title: string; text: string; cta: string };
  foot: { imprint: string; privacy: string; terms: string };
}

export const COPY: Record<LandingLanguage, LandingCopy> = {
  en: {
    name: 'English',
    ogLocale: 'en_GB',
    title: 'Keystrider: free touch typing trainer that adapts to you',
    description:
      'Learn to touch type for free. Keystrider measures every keystroke, finds the keys that slow you down and builds each drill around them. No sign-up needed.',
    nav: { languages: 'Language', signIn: 'Sign in', open: 'Open the trainer', sections: 'Page sections', method: 'Method', features: 'Features', faq: 'Questions', skip: 'Skip to content' },
    hero: {
      eyebrow: 'Free · no sign-up · no ads',
      title: 'Learn to touch type with a trainer that understands your mistakes',
      rotate: [
        'Ten fingers. Ten minutes a day.',
        'Every drill targets your slowest keys',
        'Type cleanly first, then fast',
      ],
      lead: 'Keystrider measures every keystroke, finds the keys and letter pairs that slow you down, and builds your next drill from them. So you never practise what you already know.',
      cta: 'Start practising for free',
      continue: 'Keep practising',
      note: 'Runs in your browser. No ads, no account needed.',
    },
    demo: {
      label: 'Try it: type the line',
      start: 'Click here and start typing',
      result: 'Your result',
      wpm: 'WPM',
      wpmLong: 'words per minute',
      accuracy: 'accuracy',
      slowTitle: 'These keys held you up:',
      slowNone: 'Clean and even. Let’s see how you do with the whole keyboard.',
      nextBeginner: 'Your first lesson: the six most common letters, then one new key at a time.',
      ctaBeginner: 'Start lesson 1',
      nextFast: 'You already type quite fast. About {n} more words in the trainer, then you skip the keys you already know.',
      ctaFast: 'Finish the placement',
      again: 'Try another line',
      lines: [
        'the quick brown fox jumps over the lazy dog while the band plays on',
        'practice makes progress when you keep your eyes on the screen',
        'every key you learn without looking makes the next one easier',
      ],
    },
    facts: {
      label: 'Keystrider in numbers',
      items: [
        { value: '∞', label: 'drills that adapt to your skill' },
        { value: '1 min', label: 'to your first drill, no sign-up' },
        { value: '10,000', label: 'most common words per language' },
        { value: '0', label: 'cookies, trackers and ads' },
      ],
    },
    method: {
      eyebrow: 'The method',
      title: 'How you get faster',
      intro: 'No one-size-fits-all lessons. Every drill comes from the way you type, and gets more precise with every round.',
      items: [
        { title: 'One key at a time', text: 'You start with the six most common letters and type real words early on. The next key joins only once all the previous ones are accurate and fluent.' },
        { title: 'Clean first, then fast', text: 'A wrong key holds you on the letter. When accuracy drops, the speed counter disappears until you type cleanly again.' },
        { title: 'Targeted, not uniform', text: 'Every drill leans on the keys and letter pairs that slow you down, and brings back keys you haven’t practised for a while so they stick.' },
        { title: 'Short rounds, real breaks', text: 'Warm-up, short focus rounds, then real sentences. When your concentration fades, Keystrider suggests a break instead of letting you drill in mistakes.' },
      ],
    },
    analysis: {
      eyebrow: 'What Keystrider measures',
      title: 'Keystrider notices which keys slow you down',
      text: 'Do you hesitate for a moment before the q, or mix up b and v? You barely notice, but it costs you speed every time. Keystrider times every keystroke to the millisecond and builds your next drill from exactly those keys and letter pairs.',
      points: [
        { chip: '1×', strong: 'The first try counts.', text: 'A mistake stays a mistake, even if you correct it right away.' },
        { chip: '2s', strong: 'Thinking pauses don’t count.', text: 'Pauses of more than two seconds don’t distort your speed.' },
        { chip: '↺', strong: 'Nothing gets forgotten.', text: 'Keys you haven’t practised for a while come back for review.' },
      ],
      tableTitle: 'Weakest keys',
      tableNote: 'Example after three rounds',
      columns: ['Key', 'Errors', 'Time'],
      nextPrefix: 'Next drill focuses on',
      nextSuffix: 'and the pairs around them.',
      example: { keys: ['q', 'z', 'x', 'j', 'b'], focus: ['q', 'z', 'qu'] },
    },
    features: {
      eyebrow: 'Features',
      title: 'Everything you need, nothing you don’t',
      items: [
        { title: 'Your language, your keyboard', text: 'English, German, French, Spanish, Italian or Polish, on QWERTY, QWERTZ, AZERTY, Dvorak, Colemak and more. Keystrider recognises your layout from the keys you press.' },
        { title: 'Finger guide', text: 'A keyboard under the text shows which finger is next. Keys you already know fade out bit by bit.' },
        { title: 'Placement test', text: 'Already type a bit? A one-minute test, and Keystrider skips every key you have already mastered.' },
        { title: 'Progress you can see', text: 'Speed and accuracy over time, an error heatmap and your slowest keys and letter pairs.' },
        { title: 'Weekly goal and plan', text: 'Set how often you want to practise and add the plan to your calendar. Short, regular rounds do more than rare, long ones.' },
        { title: 'Carry on anywhere', text: 'With a free account your lessons are safe even if your browser data gets deleted, and you pick up where you left off on any device.' },
      ],
    },
    vignettes: {
      layouts: ['Deutsch · German layout', 'Français · French layout', 'English · US layout', 'English · Dvorak'],
      fingerWord: 'glad',
      letters: 'Letters',
      placing: 'Placement running …',
      skipped: { one: '{n} key skipped', other: '{n} keys skipped' },
      speed: 'Speed',
      weekGoal: 'Weekly goal',
      lesson: 'Lesson',
      laptop: 'Laptop',
      tablet: 'Tablet',
      stored: 'Stored in Frankfurt, EU',
    },
    privacy: {
      eyebrow: 'Privacy',
      title: 'Your typing data stays with you',
      intro: 'Keystrider knows exactly how you type. That’s why this knowledge stays with you.',
      items: [
        { title: 'No cookies, no tracking', text: 'Keystrider sets no cookies, shows no ads and uses no analytics services.', chips: ['0 cookies', '0 trackers'] },
        { title: 'Without an account, it all stays in your browser', text: 'Your keystrokes are only stored locally. You can export or delete them at any time.', chips: ['.json', '.csv'] },
        { title: 'With an account, in the EU', text: 'The optional account syncs your rounds between your devices via servers in Frankfurt.', chips: ['Frankfurt', 'optional account'] },
      ],
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Is Keystrider free?', a: 'Yes. Practising, progress and the optional account are free, with no ads.' },
        { q: 'What makes Keystrider different from other typing trainers?', a: 'Most trainers give everyone the same lessons. Keystrider measures every keystroke and builds each drill from the keys and letter pairs that slow you down most right now.' },
        { q: 'Do I need an account?', a: 'No. You can start right away; without an account your browser keeps your progress. A free account keeps it safe even if your browser data is deleted, and lets you carry on on your other devices.' },
        { q: 'How long does it take to learn touch typing?', a: 'Most people can type without looking after a few weeks of 15 to 20 minutes a day. Short daily sessions work better than long, rare ones, and speed keeps growing after that.' },
        { q: 'Which keyboard layouts are supported?', a: 'US and UK QWERTY, German and Swiss QWERTZ, French and Belgian AZERTY, Spanish, Italian, Swedish/Finnish and Polish layouts, Dvorak and Colemak. Keystrider detects your layout from the keys you press.' },
        { q: 'Does it work on a phone or tablet?', a: 'Keystrider is made for a real keyboard. A tablet with a keyboard works well; on a phone you can look around, but touch typing needs a physical keyboard.' },
      ],
    },
    final: { title: 'Your first drill takes two minutes', text: 'Type one line and Keystrider knows where you start.', cta: 'Start practising for free' },
    foot: { imprint: 'Legal notice', privacy: 'Privacy', terms: 'Terms' },
  },

  de: {
    name: 'Deutsch',
    ogLocale: 'de_DE',
    title: 'Zehnfingersystem lernen: kostenloser Tipptrainer | Keystrider',
    description:
      'Lerne das Zehnfingersystem kostenlos online. Keystrider misst jeden Tastendruck, erkennt die Tasten, die dich bremsen, und übt gezielt diese. Ohne Anmeldung.',
    nav: { languages: 'Sprache', signIn: 'Anmelden', open: 'Zum Training', sections: 'Seitenbereiche', method: 'Methode', features: 'Funktionen', faq: 'Fragen', skip: 'Zum Inhalt springen' },
    hero: {
      eyebrow: 'Kostenlos · ohne Anmeldung · ohne Werbung',
      title: 'Lerne das Zehnfingersystem mit einem Trainer, der deine Fehler versteht',
      rotate: [
        'Zehn Finger. Zehn Minuten am Tag.',
        'Jede Übung zielt auf deine langsamsten Tasten',
        'Erst sauber tippen, dann schnell',
      ],
      lead: 'Keystrider misst jeden Tastendruck, findet die Tasten und Buchstabenpaare, die dich bremsen, und baut daraus deine nächste Übung. So übst du nie, was du schon kannst.',
      cta: 'Jetzt kostenlos üben',
      continue: 'Weiter üben',
      note: 'Läuft im Browser. Keine Werbung, kein Konto nötig.',
    },
    demo: {
      label: 'Probier’s aus: tippe die Zeile',
      start: 'Hier klicken und lostippen',
      result: 'Dein Ergebnis',
      wpm: 'WpM',
      wpmLong: 'Wörter pro Minute',
      accuracy: 'Genauigkeit',
      slowTitle: 'Bei diesen Tasten hast du gezögert:',
      slowNone: 'Sauber und gleichmäßig. Mal sehen, wie es mit der ganzen Tastatur läuft.',
      nextBeginner: 'Deine erste Lektion: die sechs häufigsten Buchstaben, dann eine neue Taste nach der anderen.',
      ctaBeginner: 'Lektion 1 starten',
      nextFast: 'Du tippst schon ziemlich flott. Noch etwa {n} Wörter im Trainer, dann überspringst du die Tasten, die du schon kannst.',
      ctaFast: 'Einstufung abschließen',
      again: 'Andere Zeile tippen',
      lines: [
        'zwölf boxkämpfer jagen viktor quer über den großen sylter deich',
        'wer blind tippt, schaut auf den text und nicht auf die tasten',
        'jede taste, die du ohne hinsehen findest, macht die nächste leichter',
      ],
    },
    facts: {
      label: 'Keystrider in Zahlen',
      items: [
        { value: '∞', label: 'Übungen, die sich deinem Können anpassen' },
        { value: '1 Min', label: 'bis zur ersten Übung, ohne Anmeldung' },
        { value: '10 000', label: 'häufigste Wörter je Sprache' },
        { value: '0', label: 'Cookies, Tracker und Werbung' },
      ],
    },
    method: {
      eyebrow: 'Die Methode',
      title: 'So wirst du schneller',
      intro: 'Keine Einheitslektionen. Jede Übung entsteht aus der Art, wie du tippst, und wird mit jeder Runde genauer.',
      items: [
        { title: 'Eine Taste nach der anderen', text: 'Du startest mit den sechs häufigsten Buchstaben und tippst früh echte Wörter. Die nächste Taste kommt erst dazu, wenn alle bisherigen sicher und flüssig sitzen.' },
        { title: 'Erst sauber, dann schnell', text: 'Eine falsche Taste hält dich auf dem Buchstaben fest. Sinkt die Genauigkeit, verschwindet die Tempoanzeige, bis du wieder sauber tippst.' },
        { title: 'Gezielt statt gleichförmig', text: 'Jede Übung setzt auf die Tasten und Buchstabenpaare, die dich bremsen, und holt länger nicht geübte Tasten zurück, damit sie sitzen bleiben.' },
        { title: 'Kurze Runden, echte Pausen', text: 'Aufwärmen, kurze Fokusrunden, dann echte Sätze. Lässt deine Konzentration nach, schlägt Keystrider eine Pause vor, statt Fehler einzuschleifen.' },
      ],
    },
    analysis: {
      eyebrow: 'Was Keystrider misst',
      title: 'Keystrider merkt, welche Tasten dich bremsen',
      text: 'Du zögerst kurz vor dem ö oder verwechselst z und y? Das spürst du kaum, aber es kostet dich jedes Mal Tempo. Keystrider misst jeden Anschlag auf die Millisekunde und stellt die nächste Übung aus genau diesen Tasten und Buchstabenpaaren zusammen.',
      points: [
        { chip: '1×', strong: 'Der erste Versuch zählt.', text: 'Ein Fehler bleibt ein Fehler, auch wenn du ihn sofort korrigierst.' },
        { chip: '2s', strong: 'Denkpausen fallen raus.', text: 'Pausen über zwei Sekunden verfälschen dein Tempo nicht.' },
        { chip: '↺', strong: 'Nichts gerät in Vergessenheit.', text: 'Tasten, die du länger nicht geübt hast, kommen zur Wiederholung zurück.' },
      ],
      tableTitle: 'Schwächste Tasten',
      tableNote: 'Beispiel nach drei Runden',
      columns: ['Taste', 'Fehler', 'Zeit'],
      nextPrefix: 'Nächste Übung setzt auf',
      nextSuffix: 'und die Paare drumherum.',
      example: { keys: ['ö', 'z', 'ü', 'c', 'v'], focus: ['ö', 'z', 'sch'] },
    },
    features: {
      eyebrow: 'Funktionen',
      title: 'Alles, was du brauchst, und nicht mehr',
      items: [
        { title: 'Deine Sprache, deine Tastatur', text: 'Deutsch, Englisch, Französisch, Spanisch, Italienisch oder Polnisch, auf QWERTZ, QWERTY, AZERTY, Dvorak, Colemak und mehr. Dein Layout erkennt Keystrider an den Tasten, die du drückst.' },
        { title: 'Fingerhilfe', text: 'Unter dem Text zeigt eine Tastatur, welcher Finger dran ist. Tasten, die du schon kannst, blendet sie nach und nach aus.' },
        { title: 'Einstufungstest', text: 'Du tippst schon ein bisschen? Eine Minute Test, und Keystrider überspringt alle Tasten, die du schon beherrschst.' },
        { title: 'Fortschritt, den du siehst', text: 'Tempo und Genauigkeit im Verlauf, eine Fehler-Heatmap und deine langsamsten Tasten und Buchstabenpaare.' },
        { title: 'Wochenziel und Plan', text: 'Leg fest, wie oft du üben willst, und trag den Plan in deinen Kalender ein. Kurze, regelmäßige Runden bringen mehr als seltene, lange.' },
        { title: 'Überall weitermachen', text: 'Mit einem kostenlosen Konto sind deine Lektionen gesichert, auch wenn Browserdaten gelöscht werden, und du machst auf jedem Gerät dort weiter, wo du aufgehört hast.' },
      ],
    },
    vignettes: {
      layouts: ['Deutsch · Deutsches Layout', 'Français · Französisches Layout', 'English · US-Layout', 'English · Dvorak'],
      fingerWord: 'glas',
      letters: 'Buchstaben',
      placing: 'Einstufung läuft …',
      skipped: { one: '{n} Taste übersprungen', other: '{n} Tasten übersprungen' },
      speed: 'Tempo',
      weekGoal: 'Wochenziel',
      lesson: 'Lektion',
      laptop: 'Laptop',
      tablet: 'Tablet',
      stored: 'Gespeichert in Frankfurt, EU',
    },
    privacy: {
      eyebrow: 'Datenschutz',
      title: 'Deine Tippdaten bleiben bei dir',
      intro: 'Keystrider weiß genau, wie du tippst. Deshalb bleibt dieses Wissen bei dir.',
      items: [
        { title: 'Keine Cookies, kein Tracking', text: 'Keystrider setzt keine Cookies, zeigt keine Werbung und nutzt keine Analysedienste.', chips: ['0 Cookies', '0 Tracker'] },
        { title: 'Ohne Konto bleibt alles im Browser', text: 'Deine Anschläge werden nur lokal gespeichert. Du kannst sie jederzeit exportieren oder löschen.', chips: ['.json', '.csv'] },
        { title: 'Mit Konto in der EU', text: 'Das freiwillige Konto gleicht deine Runden über Server in Frankfurt zwischen deinen Geräten ab.', chips: ['Frankfurt', 'freiwilliges Konto'] },
      ],
    },
    faq: {
      title: 'Häufige Fragen',
      items: [
        { q: 'Ist Keystrider kostenlos?', a: 'Ja. Üben, Fortschritt und das freiwillige Konto sind kostenlos und ohne Werbung.' },
        { q: 'Was macht Keystrider anders als andere Tipptrainer?', a: 'Die meisten Trainer geben allen dieselben Lektionen. Keystrider misst jeden Tastendruck und stellt jede Übung aus den Tasten und Buchstabenpaaren zusammen, die dich gerade am meisten bremsen.' },
        { q: 'Brauche ich ein Konto?', a: 'Nein. Du kannst sofort loslegen, ohne Konto speichert der Browser deinen Fortschritt. Mit einem kostenlosen Konto ist er sicher, auch wenn die Browserdaten gelöscht werden, und du kannst auf weiteren Geräten weitermachen.' },
        { q: 'Wie lange dauert es, das Zehnfingersystem zu lernen?', a: 'Die meisten tippen nach einigen Wochen mit 15 bis 20 Minuten am Tag blind. Kurze tägliche Einheiten bringen mehr als lange, seltene, und das Tempo steigt danach weiter.' },
        { q: 'Welche Tastaturlayouts gibt es?', a: 'Deutsches und Schweizer QWERTZ, US- und UK-QWERTY, französisches und belgisches AZERTY, spanisch, italienisch, schwedisch/finnisch und polnisch, Dvorak und Colemak. Keystrider erkennt dein Layout an den Tasten, die du drückst.' },
        { q: 'Geht das auch auf Handy oder Tablet?', a: 'Keystrider ist für eine echte Tastatur gemacht. Ein Tablet mit Tastatur funktioniert gut; auf dem Handy kannst du dich umsehen, aber blind tippen lernt man an einer richtigen Tastatur.' },
      ],
    },
    final: { title: 'Deine erste Übung dauert zwei Minuten', text: 'Eine Zeile tippen, und Keystrider weiß, wo du anfängst.', cta: 'Jetzt kostenlos üben' },
    foot: { imprint: 'Impressum', privacy: 'Datenschutz', terms: 'Nutzungsbedingungen' },
  },

  es: {
    name: 'Español',
    ogLocale: 'es_ES',
    title: 'Curso de mecanografía gratis que se adapta a ti | Keystrider',
    description:
      'Aprende mecanografía gratis y online. Keystrider mide cada pulsación, encuentra las teclas que te frenan y practica justo esas. Sin registrarte.',
    nav: { languages: 'Idioma', signIn: 'Iniciar sesión', open: 'Ir al entrenador', sections: 'Secciones de la página', method: 'Método', features: 'Funciones', faq: 'Preguntas', skip: 'Saltar al contenido' },
    hero: {
      eyebrow: 'Gratis · sin registro · sin anuncios',
      title: 'Aprende mecanografía con un entrenador que entiende tus errores',
      rotate: [
        'Diez dedos. Diez minutos al día.',
        'Cada ejercicio apunta a tus teclas más lentas',
        'Primero escribe limpio, luego rápido',
      ],
      lead: 'Keystrider mide cada pulsación, encuentra las teclas y pares de letras que te frenan y con ellos crea tu próximo ejercicio. Así nunca practicas lo que ya sabes.',
      cta: 'Empezar gratis',
      continue: 'Seguir practicando',
      note: 'Funciona en el navegador. Sin anuncios y sin cuenta.',
    },
    demo: {
      label: 'Pruébalo: escribe la línea',
      start: 'Haz clic aquí y empieza a escribir',
      result: 'Tu resultado',
      wpm: 'PPM',
      wpmLong: 'palabras por minuto',
      accuracy: 'precisión',
      slowTitle: 'Estas teclas te hicieron dudar:',
      slowNone: 'Limpio y constante. Veamos qué tal con el teclado completo.',
      nextBeginner: 'Tu primera lección: las seis letras más frecuentes y luego una tecla nueva cada vez.',
      ctaBeginner: 'Empezar la lección 1',
      nextFast: 'Ya escribes bastante rápido. Unas {n} palabras más en el entrenador y te saltas las teclas que ya dominas.',
      ctaFast: 'Terminar la prueba de nivel',
      again: 'Escribir otra línea',
      lines: [
        'el veloz murciélago hindú comía feliz cardillo y kiwi',
        'quien escribe sin mirar tiene los ojos en el texto y no en las teclas',
        'cada tecla que encuentras sin mirar hace más fácil la siguiente',
      ],
    },
    facts: {
      label: 'Keystrider en cifras',
      items: [
        { value: '∞', label: 'ejercicios que se adaptan a tu nivel' },
        { value: '1 min', label: 'hasta tu primer ejercicio, sin registro' },
        { value: '10 000', label: 'palabras más frecuentes por idioma' },
        { value: '0', label: 'cookies, rastreadores y anuncios' },
      ],
    },
    method: {
      eyebrow: 'El método',
      title: 'Cómo te vuelves más rápido',
      intro: 'Nada de lecciones iguales para todos. Cada ejercicio nace de tu forma de escribir y se afina con cada ronda.',
      items: [
        { title: 'Una tecla tras otra', text: 'Empiezas con las seis letras más frecuentes y pronto escribes palabras reales. La siguiente tecla solo llega cuando todas las anteriores son precisas y fluidas.' },
        { title: 'Primero limpio, luego rápido', text: 'Una tecla equivocada te deja en la misma letra. Si baja la precisión, la velocidad se oculta hasta que vuelves a escribir limpio.' },
        { title: 'Dirigido, no uniforme', text: 'Cada ejercicio insiste en las teclas y pares de letras que te frenan y repasa las que llevas tiempo sin practicar para que no se olviden.' },
        { title: 'Rondas cortas, pausas de verdad', text: 'Calentamiento, rondas cortas de enfoque y luego frases reales. Cuando tu concentración baja, Keystrider te propone una pausa en lugar de repetir errores.' },
      ],
    },
    analysis: {
      eyebrow: 'Lo que mide Keystrider',
      title: 'Keystrider nota qué teclas te frenan',
      text: '¿Dudas un instante antes de la ñ o confundes la b y la v? Apenas lo notas, pero cada vez te cuesta velocidad. Keystrider mide cada pulsación al milisegundo y arma tu próximo ejercicio justo con esas teclas y pares de letras.',
      points: [
        { chip: '1×', strong: 'Cuenta el primer intento.', text: 'Un error sigue siendo un error, aunque lo corrijas al momento.' },
        { chip: '2s', strong: 'Las pausas para pensar no cuentan.', text: 'Las pausas de más de dos segundos no falsean tu velocidad.' },
        { chip: '↺', strong: 'Nada cae en el olvido.', text: 'Las teclas que llevas tiempo sin practicar vuelven para repasarlas.' },
      ],
      tableTitle: 'Teclas más débiles',
      tableNote: 'Ejemplo tras tres rondas',
      columns: ['Tecla', 'Errores', 'Tiempo'],
      nextPrefix: 'El próximo ejercicio se centra en',
      nextSuffix: 'y los pares de alrededor.',
      example: { keys: ['ñ', 'z', 'j', 'x', 'q'], focus: ['ñ', 'z', 'qu'] },
    },
    features: {
      eyebrow: 'Funciones',
      title: 'Todo lo que necesitas, nada más',
      items: [
        { title: 'Tu idioma, tu teclado', text: 'Español, inglés, alemán, francés, italiano o polaco, en QWERTY, QWERTZ, AZERTY, Dvorak, Colemak y más. Keystrider reconoce tu distribución por las teclas que pulsas.' },
        { title: 'Guía de dedos', text: 'Bajo el texto, un teclado muestra qué dedo toca. Las teclas que ya dominas se van atenuando poco a poco.' },
        { title: 'Prueba de nivel', text: '¿Ya escribes algo? Un minuto de prueba y Keystrider se salta todas las teclas que ya dominas.' },
        { title: 'Progreso visible', text: 'Velocidad y precisión a lo largo del tiempo, un mapa de errores y tus teclas y pares de letras más lentos.' },
        { title: 'Meta semanal y plan', text: 'Decide cuántas veces quieres practicar y añade el plan a tu calendario. Rondas cortas y regulares rinden más que largas y esporádicas.' },
        { title: 'Sigue en cualquier lugar', text: 'Con una cuenta gratuita tus lecciones están a salvo aunque se borren los datos del navegador, y sigues donde lo dejaste en cualquier dispositivo.' },
      ],
    },
    vignettes: {
      layouts: ['Deutsch · distribución alemana', 'Français · distribución francesa', 'Español · distribución española', 'English · Dvorak'],
      fingerWord: 'hada',
      letters: 'Letras',
      placing: 'Prueba de nivel en curso …',
      skipped: { one: '{n} tecla saltada', other: '{n} teclas saltadas' },
      speed: 'Velocidad',
      weekGoal: 'Meta semanal',
      lesson: 'Lección',
      laptop: 'Portátil',
      tablet: 'Tableta',
      stored: 'Guardado en Fráncfort, UE',
    },
    privacy: {
      eyebrow: 'Privacidad',
      title: 'Tus datos de escritura se quedan contigo',
      intro: 'Keystrider sabe exactamente cómo escribes. Por eso ese conocimiento se queda contigo.',
      items: [
        { title: 'Sin cookies ni rastreo', text: 'Keystrider no usa cookies, no muestra anuncios y no utiliza servicios de analítica.', chips: ['0 cookies', '0 rastreadores'] },
        { title: 'Sin cuenta, todo queda en el navegador', text: 'Tus pulsaciones solo se guardan en tu equipo. Puedes exportarlas o borrarlas cuando quieras.', chips: ['.json', '.csv'] },
        { title: 'Con cuenta, en la UE', text: 'La cuenta opcional sincroniza tus rondas entre tus dispositivos a través de servidores en Fráncfort.', chips: ['Fráncfort', 'cuenta opcional'] },
      ],
    },
    faq: {
      title: 'Preguntas frecuentes',
      items: [
        { q: '¿Keystrider es gratis?', a: 'Sí. Practicar, ver tu progreso y la cuenta opcional son gratis y sin anuncios.' },
        { q: '¿Qué hace diferente a Keystrider de otros cursos de mecanografía?', a: 'La mayoría da a todos las mismas lecciones. Keystrider mide cada pulsación y crea cada ejercicio con las teclas y pares de letras que más te frenan en ese momento.' },
        { q: '¿Necesito una cuenta?', a: 'No. Puedes empezar ya; sin cuenta, el navegador guarda tu progreso. Con una cuenta gratuita está a salvo aunque se borren los datos del navegador, y puedes seguir en tus otros dispositivos.' },
        { q: '¿Cuánto se tarda en aprender mecanografía?', a: 'La mayoría escribe sin mirar tras unas semanas de 15 a 20 minutos al día. Sesiones cortas y diarias funcionan mejor que largas y esporádicas, y la velocidad sigue subiendo después.' },
        { q: '¿Qué distribuciones de teclado hay?', a: 'Español, QWERTY de EE. UU. y Reino Unido, QWERTZ alemán y suizo, AZERTY francés y belga, italiano, sueco/finés y polaco, Dvorak y Colemak. Keystrider detecta tu distribución por las teclas que pulsas.' },
        { q: '¿Funciona en el móvil o la tableta?', a: 'Keystrider está pensado para un teclado físico. Una tableta con teclado funciona bien; en el móvil puedes echar un vistazo, pero la mecanografía se aprende con un teclado de verdad.' },
      ],
    },
    final: { title: 'Tu primer ejercicio lleva dos minutos', text: 'Escribe una línea y Keystrider sabrá por dónde empiezas.', cta: 'Empezar gratis' },
    foot: { imprint: 'Aviso legal', privacy: 'Privacidad', terms: 'Condiciones de uso' },
  },

  fr: {
    name: 'Français',
    ogLocale: 'fr_FR',
    title: 'Apprendre la dactylographie gratuitement | Keystrider',
    description:
      'Apprenez à taper au clavier à dix doigts, gratuitement. Keystrider mesure chaque frappe, trouve les touches qui vous freinent et les travaille. Sans inscription.',
    nav: { languages: 'Langue', signIn: 'Se connecter', open: 'Ouvrir l’entraîneur', sections: 'Sections de la page', method: 'Méthode', features: 'Fonctionnalités', faq: 'Questions', skip: 'Aller au contenu' },
    hero: {
      eyebrow: 'Gratuit · sans inscription · sans publicité',
      title: 'Tapez à dix doigts avec un entraîneur qui comprend vos erreurs',
      rotate: [
        'Dix doigts. Dix minutes par jour.',
        'Chaque exercice cible vos touches les plus lentes',
        'D’abord taper juste, ensuite vite',
      ],
      lead: 'Keystrider mesure chaque frappe, trouve les touches et paires de lettres qui vous freinent et en fait votre prochain exercice. Vous ne travaillez jamais ce que vous savez déjà.',
      cta: 'Commencer gratuitement',
      continue: 'Continuer l’entraînement',
      note: 'Dans le navigateur. Sans publicité, sans compte.',
    },
    demo: {
      label: 'Essayez : tapez la ligne',
      start: 'Cliquez ici et commencez à taper',
      result: 'Votre résultat',
      wpm: 'MPM',
      wpmLong: 'mots par minute',
      accuracy: 'précision',
      slowTitle: 'Ces touches vous ont fait hésiter :',
      slowNone: 'Propre et régulier. Voyons ce que ça donne avec tout le clavier.',
      nextBeginner: 'Votre première leçon : les six lettres les plus fréquentes, puis une nouvelle touche à la fois.',
      ctaBeginner: 'Commencer la leçon 1',
      nextFast: 'Vous tapez déjà assez vite. Encore environ {n} mots dans l’entraîneur, puis vous sautez les touches que vous maîtrisez.',
      ctaFast: 'Terminer le test de niveau',
      again: 'Taper une autre ligne',
      lines: [
        'portez ce vieux whisky au juge blond qui fume',
        'taper sans regarder, c’est garder les yeux sur le texte et pas sur le clavier',
        'chaque touche trouvée sans regarder rend la suivante plus facile',
      ],
    },
    facts: {
      label: 'Keystrider en chiffres',
      items: [
        { value: '∞', label: 'exercices qui s’adaptent à votre niveau' },
        { value: '1 min', label: 'jusqu’au premier exercice, sans inscription' },
        { value: '10 000', label: 'mots les plus fréquents par langue' },
        { value: '0', label: 'cookie, traceur ou publicité' },
      ],
    },
    method: {
      eyebrow: 'La méthode',
      title: 'Comment vous gagnez en vitesse',
      intro: 'Pas de leçons identiques pour tous. Chaque exercice naît de votre façon de taper et s’affine à chaque série.',
      items: [
        { title: 'Une touche après l’autre', text: 'Vous commencez par les six lettres les plus fréquentes et tapez vite de vrais mots. La touche suivante n’arrive que lorsque toutes les précédentes sont sûres et fluides.' },
        { title: 'D’abord juste, ensuite vite', text: 'Une mauvaise touche vous retient sur la lettre. Si la précision baisse, l’affichage de la vitesse disparaît jusqu’à ce que vous tapiez de nouveau proprement.' },
        { title: 'Ciblé, pas uniforme', text: 'Chaque exercice insiste sur les touches et paires de lettres qui vous freinent et ramène celles que vous n’avez pas travaillées depuis un moment, pour qu’elles restent.' },
        { title: 'Séries courtes, vraies pauses', text: 'Échauffement, courtes séries ciblées, puis de vraies phrases. Quand votre concentration baisse, Keystrider propose une pause plutôt que d’ancrer les erreurs.' },
      ],
    },
    analysis: {
      eyebrow: 'Ce que mesure Keystrider',
      title: 'Keystrider repère les touches qui vous freinent',
      text: 'Vous hésitez un instant avant le é ou confondez le b et le n ? Vous le remarquez à peine, mais cela vous coûte de la vitesse à chaque fois. Keystrider mesure chaque frappe à la milliseconde et compose votre prochain exercice avec exactement ces touches et paires de lettres.',
      points: [
        { chip: '1×', strong: 'Le premier essai compte.', text: 'Une erreur reste une erreur, même si vous la corrigez aussitôt.' },
        { chip: '2s', strong: 'Les pauses de réflexion ne comptent pas.', text: 'Les pauses de plus de deux secondes ne faussent pas votre vitesse.' },
        { chip: '↺', strong: 'Rien ne tombe dans l’oubli.', text: 'Les touches que vous n’avez pas travaillées depuis un moment reviennent en révision.' },
      ],
      tableTitle: 'Touches les plus faibles',
      tableNote: 'Exemple après trois séries',
      columns: ['Touche', 'Erreurs', 'Temps'],
      nextPrefix: 'Le prochain exercice cible',
      nextSuffix: 'et les paires autour.',
      example: { keys: ['é', 'è', 'ç', 'à', 'w'], focus: ['é', 'è', 'qu'] },
    },
    features: {
      eyebrow: 'Fonctionnalités',
      title: 'L’essentiel, rien de plus',
      items: [
        { title: 'Votre langue, votre clavier', text: 'Français, anglais, allemand, espagnol, italien ou polonais, sur AZERTY, QWERTY, QWERTZ, Dvorak, Colemak et d’autres. Keystrider reconnaît votre disposition aux touches que vous tapez.' },
        { title: 'Guide des doigts', text: 'Sous le texte, un clavier montre quel doigt utiliser. Les touches que vous connaissez déjà s’estompent peu à peu.' },
        { title: 'Test de niveau', text: 'Vous tapez déjà un peu ? Une minute de test, et Keystrider saute toutes les touches que vous maîtrisez.' },
        { title: 'Des progrès visibles', text: 'Vitesse et précision dans le temps, une carte des erreurs et vos touches et paires de lettres les plus lentes.' },
        { title: 'Objectif et planning', text: 'Choisissez à quelle fréquence vous entraîner et ajoutez le planning à votre agenda. Des séries courtes et régulières valent mieux que de longues séances rares.' },
        { title: 'Continuez partout', text: 'Avec un compte gratuit, vos leçons sont sauvegardées même si les données du navigateur sont effacées, et vous reprenez là où vous en étiez sur n’importe quel appareil.' },
      ],
    },
    vignettes: {
      layouts: ['Deutsch · disposition allemande', 'Français · disposition française', 'English · disposition américaine', 'English · Dvorak'],
      fingerWord: 'type',
      letters: 'Lettres',
      placing: 'Test en cours …',
      skipped: { one: '{n} touche sautée', other: '{n} touches sautées' },
      speed: 'Vitesse',
      weekGoal: 'Objectif de la semaine',
      lesson: 'Leçon',
      laptop: 'Portable',
      tablet: 'Tablette',
      stored: 'Hébergé à Francfort, UE',
    },
    privacy: {
      eyebrow: 'Confidentialité',
      title: 'Vos données de frappe restent chez vous',
      intro: 'Keystrider sait exactement comment vous tapez. C’est pourquoi ce savoir reste chez vous.',
      items: [
        { title: 'Ni cookies ni pistage', text: 'Keystrider ne dépose aucun cookie, n’affiche aucune publicité et n’utilise aucun service d’analyse.', chips: ['0 cookie', '0 traceur'] },
        { title: 'Sans compte, tout reste dans le navigateur', text: 'Vos frappes sont enregistrées uniquement en local. Vous pouvez les exporter ou les supprimer à tout moment.', chips: ['.json', '.csv'] },
        { title: 'Avec un compte, dans l’UE', text: 'Le compte facultatif synchronise vos séries entre vos appareils via des serveurs à Francfort.', chips: ['Francfort', 'compte facultatif'] },
      ],
    },
    faq: {
      title: 'Questions fréquentes',
      items: [
        { q: 'Keystrider est-il gratuit ?', a: 'Oui. L’entraînement, le suivi des progrès et le compte facultatif sont gratuits et sans publicité.' },
        { q: 'Qu’est-ce qui distingue Keystrider des autres logiciels de dactylographie ?', a: 'La plupart donnent à tout le monde les mêmes leçons. Keystrider mesure chaque frappe et compose chaque exercice avec les touches et paires de lettres qui vous freinent le plus en ce moment.' },
        { q: 'Faut-il un compte ?', a: 'Non. Vous pouvez commencer tout de suite ; sans compte, le navigateur garde vos progrès. Avec un compte gratuit, ils sont en sécurité même si les données du navigateur sont effacées, et vous pouvez continuer sur vos autres appareils.' },
        { q: 'Combien de temps faut-il pour apprendre à taper à dix doigts ?', a: 'La plupart des gens tapent sans regarder après quelques semaines à raison de 15 à 20 minutes par jour. Des séances courtes et quotidiennes valent mieux que de longues séances rares, et la vitesse continue ensuite de progresser.' },
        { q: 'Quelles dispositions de clavier sont prises en charge ?', a: 'AZERTY français et belge, QWERTY américain et britannique, QWERTZ allemand et suisse, espagnol, italien, suédois/finnois et polonais, Dvorak et Colemak. Keystrider reconnaît votre disposition aux touches que vous tapez.' },
        { q: 'Ça marche sur téléphone ou tablette ?', a: 'Keystrider est fait pour un vrai clavier. Une tablette avec clavier fonctionne bien ; sur téléphone vous pouvez jeter un œil, mais la frappe à dix doigts s’apprend sur un clavier physique.' },
      ],
    },
    final: { title: 'Votre premier exercice prend deux minutes', text: 'Tapez une ligne et Keystrider sait par où vous commencez.', cta: 'Commencer gratuitement' },
    foot: { imprint: 'Mentions légales', privacy: 'Confidentialité', terms: 'Conditions d’utilisation' },
  },

  it: {
    name: 'Italiano',
    ogLocale: 'it_IT',
    title: 'Corso di dattilografia gratis che si adatta a te | Keystrider',
    description:
      'Impara a scrivere con dieci dita, gratis e online. Keystrider misura ogni battuta, trova i tasti che ti rallentano e allena proprio quelli. Senza registrazione.',
    nav: { languages: 'Lingua', signIn: 'Accedi', open: 'Apri l’allenatore', sections: 'Sezioni della pagina', method: 'Metodo', features: 'Funzioni', faq: 'Domande', skip: 'Vai al contenuto' },
    hero: {
      eyebrow: 'Gratis · senza registrazione · senza pubblicità',
      title: 'Impara a scrivere con dieci dita con un allenatore che capisce i tuoi errori',
      rotate: [
        'Dieci dita. Dieci minuti al giorno.',
        'Ogni esercizio punta sui tuoi tasti più lenti',
        'Prima scrivi pulito, poi veloce',
      ],
      lead: 'Keystrider misura ogni battuta, trova i tasti e le coppie di lettere che ti rallentano e ne fa il tuo prossimo esercizio. Così non ti alleni mai su ciò che sai già.',
      cta: 'Inizia gratis',
      continue: 'Continua ad allenarti',
      note: 'Funziona nel browser. Niente pubblicità, nessun account.',
    },
    demo: {
      label: 'Provalo: scrivi la riga',
      start: 'Clicca qui e inizia a scrivere',
      result: 'Il tuo risultato',
      wpm: 'PPM',
      wpmLong: 'parole al minuto',
      accuracy: 'precisione',
      slowTitle: 'Su questi tasti hai esitato:',
      slowNone: 'Pulito e regolare. Vediamo come va con tutta la tastiera.',
      nextBeginner: 'La tua prima lezione: le sei lettere più frequenti, poi un tasto nuovo alla volta.',
      ctaBeginner: 'Inizia la lezione 1',
      nextFast: 'Scrivi già piuttosto veloce. Ancora circa {n} parole nell’allenatore, poi salti i tasti che conosci già.',
      ctaFast: 'Completa il test di livello',
      again: 'Scrivi un’altra riga',
      lines: [
        'quel vituperabile xenofobo zelante assaggia il whisky ed esclama alleluja',
        'chi scrive senza guardare tiene gli occhi sul testo e non sui tasti',
        'ogni tasto che trovi senza guardare rende più facile il prossimo',
      ],
    },
    facts: {
      label: 'Keystrider in cifre',
      items: [
        { value: '∞', label: 'esercizi che si adattano al tuo livello' },
        { value: '1 min', label: 'al primo esercizio, senza registrazione' },
        { value: '10.000', label: 'parole più frequenti per lingua' },
        { value: '0', label: 'cookie, tracker e pubblicità' },
      ],
    },
    method: {
      eyebrow: 'Il metodo',
      title: 'Come diventi più veloce',
      intro: 'Niente lezioni uguali per tutti. Ogni esercizio nasce da come scrivi e diventa più preciso a ogni round.',
      items: [
        { title: 'Un tasto dopo l’altro', text: 'Inizi con le sei lettere più frequenti e presto scrivi parole vere. Il tasto successivo arriva solo quando tutti i precedenti sono sicuri e fluidi.' },
        { title: 'Prima pulito, poi veloce', text: 'Un tasto sbagliato ti ferma sulla lettera. Se la precisione cala, l’indicatore di velocità sparisce finché non scrivi di nuovo pulito.' },
        { title: 'Mirato, non uniforme', text: 'Ogni esercizio insiste sui tasti e le coppie di lettere che ti rallentano e riporta quelli che non alleni da un po’, perché restino.' },
        { title: 'Round brevi, pause vere', text: 'Riscaldamento, brevi round di concentrazione, poi frasi vere. Quando la concentrazione cala, Keystrider ti propone una pausa invece di farti ripetere gli errori.' },
      ],
    },
    analysis: {
      eyebrow: 'Cosa misura Keystrider',
      title: 'Keystrider si accorge di quali tasti ti rallentano',
      text: 'Esiti un attimo prima della ò o confondi la b e la v? Te ne accorgi appena, ma ogni volta ti costa velocità. Keystrider misura ogni battuta al millisecondo e compone il prossimo esercizio proprio con quei tasti e coppie di lettere.',
      points: [
        { chip: '1×', strong: 'Conta il primo tentativo.', text: 'Un errore resta un errore, anche se lo correggi subito.' },
        { chip: '2s', strong: 'Le pause per pensare non contano.', text: 'Le pause oltre i due secondi non falsano la tua velocità.' },
        { chip: '↺', strong: 'Niente finisce nel dimenticatoio.', text: 'I tasti che non alleni da un po’ tornano per un ripasso.' },
      ],
      tableTitle: 'Tasti più deboli',
      tableNote: 'Esempio dopo tre round',
      columns: ['Tasto', 'Errori', 'Tempo'],
      nextPrefix: 'Il prossimo esercizio punta su',
      nextSuffix: 'e le coppie intorno.',
      example: { keys: ['ò', 'à', 'z', 'q', 'ù'], focus: ['ò', 'z', 'gl'] },
    },
    features: {
      eyebrow: 'Funzioni',
      title: 'Tutto quello che serve, niente di più',
      items: [
        { title: 'La tua lingua, la tua tastiera', text: 'Italiano, inglese, tedesco, francese, spagnolo o polacco, su QWERTY, QWERTZ, AZERTY, Dvorak, Colemak e altre. Keystrider riconosce il tuo layout dai tasti che premi.' },
        { title: 'Guida per le dita', text: 'Sotto il testo una tastiera mostra quale dito tocca. I tasti che conosci già sbiadiscono a poco a poco.' },
        { title: 'Test di livello', text: 'Scrivi già un po’? Un minuto di test, e Keystrider salta tutti i tasti che padroneggi.' },
        { title: 'Progressi visibili', text: 'Velocità e precisione nel tempo, una mappa degli errori e i tuoi tasti e coppie di lettere più lenti.' },
        { title: 'Obiettivo settimanale e piano', text: 'Scegli quanto spesso vuoi allenarti e aggiungi il piano al tuo calendario. Round brevi e regolari rendono più di sessioni lunghe e rare.' },
        { title: 'Continua ovunque', text: 'Con un account gratuito le tue lezioni sono al sicuro anche se i dati del browser vengono cancellati, e riprendi da dove avevi lasciato su qualsiasi dispositivo.' },
      ],
    },
    vignettes: {
      layouts: ['Deutsch · layout tedesco', 'Français · layout francese', 'Italiano · layout italiano', 'English · Dvorak'],
      fingerWord: 'gala',
      letters: 'Lettere',
      placing: 'Test in corso …',
      skipped: { one: '{n} tasto saltato', other: '{n} tasti saltati' },
      speed: 'Velocità',
      weekGoal: 'Obiettivo settimanale',
      lesson: 'Lezione',
      laptop: 'Portatile',
      tablet: 'Tablet',
      stored: 'Salvato a Francoforte, UE',
    },
    privacy: {
      eyebrow: 'Privacy',
      title: 'I tuoi dati di battitura restano tuoi',
      intro: 'Keystrider sa esattamente come scrivi. Per questo questa conoscenza resta a te.',
      items: [
        { title: 'Niente cookie, niente tracciamento', text: 'Keystrider non usa cookie, non mostra pubblicità e non usa servizi di analisi.', chips: ['0 cookie', '0 tracker'] },
        { title: 'Senza account resta tutto nel browser', text: 'Le tue battute vengono salvate solo in locale. Puoi esportarle o cancellarle quando vuoi.', chips: ['.json', '.csv'] },
        { title: 'Con account, nell’UE', text: 'L’account facoltativo sincronizza i tuoi round tra i dispositivi tramite server a Francoforte.', chips: ['Francoforte', 'account facoltativo'] },
      ],
    },
    faq: {
      title: 'Domande frequenti',
      items: [
        { q: 'Keystrider è gratis?', a: 'Sì. Allenamento, progressi e l’account facoltativo sono gratis e senza pubblicità.' },
        { q: 'Cosa rende Keystrider diverso dagli altri corsi di dattilografia?', a: 'La maggior parte dà a tutti le stesse lezioni. Keystrider misura ogni battuta e compone ogni esercizio con i tasti e le coppie di lettere che ti rallentano di più in quel momento.' },
        { q: 'Serve un account?', a: 'No. Puoi iniziare subito; senza account è il browser a salvare i tuoi progressi. Con un account gratuito sono al sicuro anche se i dati del browser vengono cancellati, e puoi continuare sugli altri tuoi dispositivi.' },
        { q: 'Quanto ci vuole per imparare a scrivere con dieci dita?', a: 'La maggior parte delle persone scrive senza guardare dopo qualche settimana di 15–20 minuti al giorno. Sessioni brevi e quotidiane funzionano meglio di sessioni lunghe e rare, e la velocità poi continua a crescere.' },
        { q: 'Quali layout di tastiera sono supportati?', a: 'Italiano, QWERTY americano e britannico, QWERTZ tedesco e svizzero, AZERTY francese e belga, spagnolo, svedese/finlandese e polacco, Dvorak e Colemak. Keystrider riconosce il tuo layout dai tasti che premi.' },
        { q: 'Funziona su telefono o tablet?', a: 'Keystrider è pensato per una tastiera vera. Un tablet con tastiera va bene; sul telefono puoi dare un’occhiata, ma a scrivere con dieci dita si impara su una tastiera fisica.' },
      ],
    },
    final: { title: 'Il primo esercizio richiede due minuti', text: 'Scrivi una riga e Keystrider sa da dove partire.', cta: 'Inizia gratis' },
    foot: { imprint: 'Note legali', privacy: 'Privacy', terms: 'Condizioni d’uso' },
  },

  pl: {
    name: 'Polski',
    ogLocale: 'pl_PL',
    title: 'Nauka pisania bezwzrokowego za darmo | Keystrider',
    description:
      'Naucz się pisać bezwzrokowo, za darmo i online. Keystrider mierzy każde uderzenie, znajduje klawisze, które cię spowalniają, i ćwiczy właśnie je. Bez rejestracji.',
    nav: { languages: 'Język', signIn: 'Zaloguj się', open: 'Otwórz trenera', sections: 'Sekcje strony', method: 'Metoda', features: 'Funkcje', faq: 'Pytania', skip: 'Przejdź do treści' },
    hero: {
      eyebrow: 'Za darmo · bez rejestracji · bez reklam',
      title: 'Naucz się pisać bezwzrokowo z trenerem, który rozumie twoje błędy',
      rotate: [
        'Dziesięć palców. Dziesięć minut dziennie.',
        'Każde ćwiczenie celuje w twoje najwolniejsze klawisze',
        'Najpierw czysto, potem szybko',
      ],
      lead: 'Keystrider mierzy każde uderzenie, znajduje klawisze i pary liter, które cię spowalniają, i robi z nich twoje kolejne ćwiczenie. Nigdy nie ćwiczysz tego, co już umiesz.',
      cta: 'Zacznij za darmo',
      continue: 'Ćwicz dalej',
      note: 'Działa w przeglądarce. Bez reklam i bez konta.',
    },
    demo: {
      label: 'Spróbuj: przepisz linijkę',
      start: 'Kliknij tutaj i zacznij pisać',
      result: 'Twój wynik',
      wpm: 'sł./min',
      wpmLong: 'słów na minutę',
      accuracy: 'dokładność',
      slowTitle: 'Przy tych klawiszach się zawahałeś(-aś):',
      slowNone: 'Czysto i równo. Zobaczmy, jak pójdzie z całą klawiaturą.',
      nextBeginner: 'Twoja pierwsza lekcja: sześć najczęstszych liter, potem jeden nowy klawisz naraz.',
      ctaBeginner: 'Zacznij lekcję 1',
      nextFast: 'Piszesz już całkiem szybko. Jeszcze około {n} słów w trenerze, a potem pominiesz klawisze, które już znasz.',
      ctaFast: 'Dokończ test poziomujący',
      again: 'Przepisz inną linijkę',
      lines: [
        'pchnąć w tę łódź jeża lub ośm skrzyń fig',
        'kto pisze bezwzrokowo, patrzy na tekst, a nie na klawisze',
        'każdy klawisz znaleziony bez patrzenia ułatwia następny',
      ],
    },
    facts: {
      label: 'Keystrider w liczbach',
      items: [
        { value: '∞', label: 'ćwiczeń dopasowanych do twoich umiejętności' },
        { value: '1 min', label: 'do pierwszego ćwiczenia, bez rejestracji' },
        { value: '10 000', label: 'najczęstszych słów w każdym języku' },
        { value: '0', label: 'ciasteczek, trackerów i reklam' },
      ],
    },
    method: {
      eyebrow: 'Metoda',
      title: 'Jak przyspieszasz',
      intro: 'Żadnych lekcji dla wszystkich. Każde ćwiczenie powstaje z tego, jak piszesz, i z każdą rundą jest dokładniejsze.',
      items: [
        { title: 'Klawisz po klawiszu', text: 'Zaczynasz od sześciu najczęstszych liter i szybko piszesz prawdziwe słowa. Kolejny klawisz dochodzi dopiero wtedy, gdy wszystkie dotychczasowe siedzą pewnie i płynnie.' },
        { title: 'Najpierw czysto, potem szybko', text: 'Błędny klawisz zatrzymuje cię na literze. Gdy dokładność spada, licznik tempa znika, dopóki znów nie piszesz czysto.' },
        { title: 'Celowo, nie po równo', text: 'Każde ćwiczenie stawia na klawisze i pary liter, które cię spowalniają, i wraca do tych, których dawno nie ćwiczyłeś(-aś), żeby zostały w pamięci.' },
        { title: 'Krótkie rundy, prawdziwe przerwy', text: 'Rozgrzewka, krótkie rundy skupienia, potem prawdziwe zdania. Gdy słabnie koncentracja, Keystrider proponuje przerwę, zamiast utrwalać błędy.' },
      ],
    },
    analysis: {
      eyebrow: 'Co mierzy Keystrider',
      title: 'Keystrider zauważa, które klawisze cię spowalniają',
      text: 'Wahasz się chwilę przed ą albo mylisz b i n? Ledwo to czujesz, ale za każdym razem kosztuje cię to tempo. Keystrider mierzy każde uderzenie co do milisekundy i układa kolejne ćwiczenie właśnie z tych klawiszy i par liter.',
      points: [
        { chip: '1×', strong: 'Liczy się pierwsza próba.', text: 'Błąd zostaje błędem, nawet jeśli od razu go poprawisz.' },
        { chip: '2s', strong: 'Przerwy na myślenie się nie liczą.', text: 'Przerwy dłuższe niż dwie sekundy nie zaniżają twojego tempa.' },
        { chip: '↺', strong: 'Nic nie idzie w zapomnienie.', text: 'Klawisze, których dawno nie ćwiczyłeś(-aś), wracają do powtórki.' },
      ],
      tableTitle: 'Najsłabsze klawisze',
      tableNote: 'Przykład po trzech rundach',
      columns: ['Klawisz', 'Błędy', 'Czas'],
      nextPrefix: 'Następne ćwiczenie stawia na',
      nextSuffix: 'i pary wokół nich.',
      example: { keys: ['ą', 'ę', 'ź', 'ż', 'ć'], focus: ['ą', 'ę', 'rz'] },
    },
    features: {
      eyebrow: 'Funkcje',
      title: 'Wszystko, czego trzeba, nic ponad to',
      items: [
        { title: 'Twój język, twoja klawiatura', text: 'Polski, angielski, niemiecki, francuski, hiszpański lub włoski, na QWERTY, QWERTZ, AZERTY, Dvorak, Colemak i innych. Keystrider rozpoznaje układ po klawiszach, które naciskasz.' },
        { title: 'Podpowiedź palców', text: 'Pod tekstem klawiatura pokazuje, który palec jest teraz potrzebny. Klawisze, które już znasz, stopniowo przygasają.' },
        { title: 'Test poziomujący', text: 'Już trochę piszesz? Minuta testu i Keystrider pomija wszystkie klawisze, które już opanowałeś(-aś).' },
        { title: 'Widoczne postępy', text: 'Tempo i dokładność w czasie, mapa błędów oraz twoje najwolniejsze klawisze i pary liter.' },
        { title: 'Cel tygodniowy i plan', text: 'Ustal, jak często chcesz ćwiczyć, i dodaj plan do kalendarza. Krótkie, regularne rundy dają więcej niż rzadkie i długie.' },
        { title: 'Kontynuuj wszędzie', text: 'Z darmowym kontem twoje lekcje są bezpieczne, nawet jeśli dane przeglądarki zostaną usunięte, a na każdym urządzeniu kontynuujesz tam, gdzie skończyłeś(-aś).' },
      ],
    },
    vignettes: {
      layouts: ['Deutsch · układ niemiecki', 'Français · układ francuski', 'Polski · układ programisty', 'English · Dvorak'],
      fingerWord: 'laska',
      letters: 'Litery',
      placing: 'Test w toku …',
      skipped: { one: 'Pominięto {n} klawisz', few: 'Pominięto {n} klawisze', other: 'Pominięto {n} klawiszy' },
      speed: 'Tempo',
      weekGoal: 'Cel tygodniowy',
      lesson: 'Lekcja',
      laptop: 'Laptop',
      tablet: 'Tablet',
      stored: 'Zapisane we Frankfurcie, UE',
    },
    privacy: {
      eyebrow: 'Prywatność',
      title: 'Twoje dane z pisania zostają przy tobie',
      intro: 'Keystrider wie dokładnie, jak piszesz. Dlatego ta wiedza zostaje przy tobie.',
      items: [
        { title: 'Bez ciasteczek i śledzenia', text: 'Keystrider nie używa ciasteczek, nie wyświetla reklam i nie korzysta z usług analitycznych.', chips: ['0 ciasteczek', '0 trackerów'] },
        { title: 'Bez konta wszystko zostaje w przeglądarce', text: 'Twoje uderzenia są zapisywane tylko lokalnie. W każdej chwili możesz je wyeksportować lub usunąć.', chips: ['.json', '.csv'] },
        { title: 'Z kontem w UE', text: 'Dobrowolne konto synchronizuje twoje rundy między urządzeniami przez serwery we Frankfurcie.', chips: ['Frankfurt', 'dobrowolne konto'] },
      ],
    },
    faq: {
      title: 'Częste pytania',
      items: [
        { q: 'Czy Keystrider jest darmowy?', a: 'Tak. Ćwiczenia, postępy i dobrowolne konto są darmowe i bez reklam.' },
        { q: 'Czym Keystrider różni się od innych trenerów pisania?', a: 'Większość trenerów daje wszystkim te same lekcje. Keystrider mierzy każde uderzenie i układa każde ćwiczenie z klawiszy i par liter, które w tej chwili najbardziej cię spowalniają.' },
        { q: 'Czy potrzebuję konta?', a: 'Nie. Możesz zacząć od razu; bez konta postępy zapisuje przeglądarka. Z darmowym kontem są bezpieczne, nawet jeśli dane przeglądarki zostaną usunięte, i możesz kontynuować na innych urządzeniach.' },
        { q: 'Ile trwa nauka pisania bezwzrokowego?', a: 'Większość osób pisze bez patrzenia po kilku tygodniach ćwiczeń po 15–20 minut dziennie. Krótkie codzienne sesje działają lepiej niż długie i rzadkie, a tempo rośnie dalej.' },
        { q: 'Jakie układy klawiatury są obsługiwane?', a: 'Polski (programisty), amerykański i brytyjski QWERTY, niemiecki i szwajcarski QWERTZ, francuski i belgijski AZERTY, hiszpański, włoski, szwedzki/fiński, Dvorak i Colemak. Keystrider rozpoznaje układ po klawiszach, które naciskasz.' },
        { q: 'Czy działa na telefonie lub tablecie?', a: 'Keystrider jest zrobiony dla prawdziwej klawiatury. Tablet z klawiaturą sprawdza się dobrze; na telefonie możesz się rozejrzeć, ale pisania bezwzrokowego uczy się na fizycznej klawiaturze.' },
      ],
    },
    final: { title: 'Pierwsze ćwiczenie zajmie dwie minuty', text: 'Przepisz jedną linijkę, a Keystrider będzie wiedział, od czego zacząć.', cta: 'Zacznij za darmo' },
    foot: { imprint: 'Nota prawna', privacy: 'Prywatność', terms: 'Regulamin' },
  },
};
