/**
 * Text of the landing pages, one per interface language. Each page is its own
 * address (/, /de/, /es/, …) so search engines can show it to people searching
 * in that language; render.ts turns this into static HTML at build time.
 *
 * Only claim what the app does: the method points mirror the "How it works"
 * step of the first-run setup (onboarding.method* in the locale files).
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
  nav: { languages: string; signIn: string; open: string };
  hero: { eyebrow: string; title: string; lead: string; cta: string; note: string };
  demo: {
    label: string;
    start: string;
    wpm: string;
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
  method: { title: string; intro: string; items: Item[] };
  features: { title: string; items: Item[] };
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
    nav: { languages: 'Language', signIn: 'Sign in', open: 'Open the trainer' },
    hero: {
      eyebrow: 'Free touch typing trainer · no sign-up',
      title: 'Learn to touch type with a trainer that understands your mistakes',
      lead: 'Keystrider measures every keystroke, spots the keys and letter pairs that slow you down, and builds your next drill around them.',
      cta: 'Start practising for free',
      note: 'Runs in your browser. No ads, no account needed.',
    },
    demo: {
      label: 'Try it: type the line below',
      start: 'Click here and start typing',
      wpm: 'WPM',
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
    method: {
      title: 'How Keystrider gets you faster',
      intro: 'Not the same lessons for everyone: each drill is built from how you type.',
      items: [
        { title: 'One new key at a time', text: 'The most common letters come first, so drills read like real words early on. A new key unlocks once every key you have is accurate and quick.' },
        { title: 'Accuracy before speed', text: 'A wrong key holds you on the same letter. When accuracy drops, the speed counter disappears until you type cleanly again, because clean habits are what make you fast later.' },
        { title: 'Drills aimed at your weak spots', text: 'Every keystroke is timed. Each drill leans on the keys and letter pairs that slow you down, and brings back keys you have not practised for a while so they stick.' },
        { title: 'Short rounds and breaks', text: 'Sessions open with a warm-up and mix short focus bursts with real sentences. When your typing gets worse, Keystrider suggests a break instead of letting you drill in mistakes.' },
      ],
    },
    features: {
      title: 'Everything you need, nothing you don’t',
      items: [
        { title: 'Six languages, your keyboard', text: 'Practise English, German, French, Spanish, Italian or Polish on QWERTY, QWERTZ, AZERTY, Dvorak, Colemak and more.' },
        { title: 'Finger guide', text: 'A keyboard under the text shows which finger to use, and fades for the keys you already know.' },
        { title: 'Placement test', text: 'Already type a bit? A one-minute test skips the keys you have mastered.' },
        { title: 'Progress you can see', text: 'Speed and accuracy over time, an error heatmap and your slowest keys and letter pairs.' },
        { title: 'Weekly goal and plan', text: 'Set how often you want to practise and add the plan to your calendar.' },
        { title: 'Private by default', text: 'Your data stays in your browser. An optional free account syncs it between devices, stored in the EU.' },
      ],
    },
    faq: {
      title: 'Questions',
      items: [
        { q: 'Is Keystrider free?', a: 'Yes. Practising, progress and the optional account are free, with no ads.' },
        { q: 'Do I need an account?', a: 'No. You can start right away; your progress is saved in your browser. A free account only adds syncing between devices and a backup.' },
        { q: 'How long does it take to learn touch typing?', a: 'Most people can type without looking after a few weeks of 15 to 20 minutes a day. Short daily sessions work better than long, rare ones, and speed keeps growing after that.' },
        { q: 'Which keyboard layouts are supported?', a: 'US and UK QWERTY, German and Swiss QWERTZ, French and Belgian AZERTY, Spanish, Italian, Swedish/Finnish and Polish layouts, Dvorak and Colemak. Keystrider detects your layout from the keys you press.' },
        { q: 'Does it work on a phone or tablet?', a: 'Keystrider is made for a real keyboard. A tablet with a keyboard works well; on a phone you can look around, but touch typing needs a physical keyboard.' },
      ],
    },
    final: { title: 'Your first drill takes two minutes', text: 'Pick your language, check your keyboard and start typing.', cta: 'Start practising' },
    foot: { imprint: 'Legal notice', privacy: 'Privacy', terms: 'Terms' },
  },

  de: {
    name: 'Deutsch',
    ogLocale: 'de_DE',
    title: 'Zehnfingersystem lernen: kostenloser Tipptrainer | Keystrider',
    description:
      'Lerne das Zehnfingersystem kostenlos online. Keystrider misst jeden Tastendruck, erkennt die Tasten, die dich bremsen, und übt gezielt diese. Ohne Anmeldung.',
    nav: { languages: 'Sprache', signIn: 'Anmelden', open: 'Zum Training' },
    hero: {
      eyebrow: 'Kostenloser Tipptrainer · ohne Anmeldung',
      title: 'Lerne das Zehnfingersystem mit einem Trainer, der deine Fehler versteht',
      lead: 'Keystrider misst jeden Tastendruck, erkennt die Tasten und Buchstabenpaare, die dich bremsen, und baut daraus deine nächste Übung.',
      cta: 'Jetzt kostenlos üben',
      note: 'Läuft im Browser. Keine Werbung, kein Konto nötig.',
    },
    demo: {
      label: 'Probier’s aus: tippe die Zeile unten',
      start: 'Hier klicken und lostippen',
      wpm: 'WpM',
      accuracy: 'Genauigkeit',
      slowTitle: 'Bei diesen Tasten hast du gezögert:',
      slowNone: 'Sauber und gleichmäßig. Mal sehen, wie es mit der ganzen Tastatur läuft.',
      nextBeginner: 'Deine erste Lektion: die sechs häufigsten Buchstaben, dann eine neue Taste nach der anderen.',
      ctaBeginner: 'Lektion 1 starten',
      nextFast: 'Du tippst schon ziemlich flott. Noch etwa {n} Wörter im Trainer, dann überspringst du die Tasten, die du schon kannst.',
      ctaFast: 'Einstufung abschließen',
      again: 'Andere Zeile',
      lines: [
        'zwölf boxkämpfer jagen viktor quer über den großen sylter deich',
        'wer blind tippt, schaut auf den text und nicht auf die tasten',
        'jede taste, die du ohne hinsehen findest, macht die nächste leichter',
      ],
    },
    method: {
      title: 'So wirst du schneller',
      intro: 'Keine Einheitslektionen: Jede Übung entsteht aus der Art, wie du tippst.',
      items: [
        { title: 'Eine neue Taste nach der anderen', text: 'Die häufigsten Buchstaben kommen zuerst, damit die Übungen früh wie echte Wörter klingen. Eine neue Taste kommt dazu, sobald alle bisherigen sicher und flüssig sitzen.' },
        { title: 'Genauigkeit vor Tempo', text: 'Eine falsche Taste hält dich auf demselben Buchstaben. Sinkt die Genauigkeit, verschwindet die Tempoanzeige, bis du wieder sauber tippst, denn saubere Gewohnheiten machen dich später schnell.' },
        { title: 'Übungen für deine Schwachstellen', text: 'Jeder Tastendruck wird gemessen. Jede Übung setzt auf die Tasten und Buchstabenpaare, die dich bremsen, und holt Tasten zurück, die du länger nicht geübt hast, damit sie sitzen bleiben.' },
        { title: 'Kurze Runden und Pausen', text: 'Eine Sitzung beginnt mit dem Aufwärmen und mischt kurze Fokusrunden mit echten Sätzen. Wird dein Tippen schlechter, schlägt Keystrider eine Pause vor, statt Fehler einzuschleifen.' },
      ],
    },
    features: {
      title: 'Alles, was du brauchst, und nicht mehr',
      items: [
        { title: 'Sechs Sprachen, deine Tastatur', text: 'Übe Deutsch, Englisch, Französisch, Spanisch, Italienisch oder Polnisch auf QWERTZ, QWERTY, AZERTY, Dvorak, Colemak und mehr.' },
        { title: 'Fingerhilfe', text: 'Eine Tastatur unter dem Text zeigt, welcher Finger dran ist, und blendet Tasten aus, die du schon kannst.' },
        { title: 'Einstufungstest', text: 'Du tippst schon ein bisschen? Ein Test von einer Minute überspringt die Tasten, die du beherrschst.' },
        { title: 'Fortschritt, den du siehst', text: 'Tempo und Genauigkeit im Verlauf, eine Fehler-Heatmap und deine langsamsten Tasten und Buchstabenpaare.' },
        { title: 'Wochenziel und Plan', text: 'Leg fest, wie oft du üben willst, und trag den Plan in deinen Kalender ein.' },
        { title: 'Privat von Anfang an', text: 'Deine Daten bleiben im Browser. Ein freiwilliges, kostenloses Konto synchronisiert sie zwischen Geräten, gespeichert in der EU.' },
      ],
    },
    faq: {
      title: 'Häufige Fragen',
      items: [
        { q: 'Ist Keystrider kostenlos?', a: 'Ja. Üben, Fortschritt und das freiwillige Konto sind kostenlos und ohne Werbung.' },
        { q: 'Brauche ich ein Konto?', a: 'Nein. Du kannst sofort loslegen, dein Fortschritt wird im Browser gespeichert. Ein kostenloses Konto bringt nur die Synchronisation zwischen Geräten und eine Sicherung dazu.' },
        { q: 'Wie lange dauert es, das Zehnfingersystem zu lernen?', a: 'Die meisten tippen nach einigen Wochen mit 15 bis 20 Minuten am Tag blind. Kurze tägliche Einheiten bringen mehr als lange, seltene, und das Tempo steigt danach weiter.' },
        { q: 'Welche Tastaturlayouts gibt es?', a: 'Deutsches und Schweizer QWERTZ, US- und UK-QWERTY, französisches und belgisches AZERTY, spanisch, italienisch, schwedisch/finnisch und polnisch, Dvorak und Colemak. Keystrider erkennt dein Layout an den Tasten, die du drückst.' },
        { q: 'Geht das auch auf Handy oder Tablet?', a: 'Keystrider ist für eine echte Tastatur gemacht. Ein Tablet mit Tastatur funktioniert gut; auf dem Handy kannst du dich umsehen, aber blind tippen lernt man an einer richtigen Tastatur.' },
      ],
    },
    final: { title: 'Deine erste Übung dauert zwei Minuten', text: 'Sprache wählen, Tastatur prüfen, lostippen.', cta: 'Jetzt üben' },
    foot: { imprint: 'Impressum', privacy: 'Datenschutz', terms: 'Nutzungsbedingungen' },
  },

  es: {
    name: 'Español',
    ogLocale: 'es_ES',
    title: 'Curso de mecanografía gratis que se adapta a ti | Keystrider',
    description:
      'Aprende mecanografía gratis y online. Keystrider mide cada pulsación, encuentra las teclas que te frenan y practica justo esas. Sin registrarte.',
    nav: { languages: 'Idioma', signIn: 'Iniciar sesión', open: 'Ir al entrenador' },
    hero: {
      eyebrow: 'Mecanografía gratis · sin registro',
      title: 'Aprende mecanografía con un entrenador que entiende tus errores',
      lead: 'Keystrider mide cada pulsación, detecta las teclas y pares de letras que te frenan y crea con ellos tu próximo ejercicio.',
      cta: 'Empezar gratis',
      note: 'Funciona en el navegador. Sin anuncios y sin cuenta.',
    },
    demo: {
      label: 'Pruébalo: escribe la línea de abajo',
      start: 'Haz clic aquí y empieza a escribir',
      wpm: 'PPM',
      accuracy: 'precisión',
      slowTitle: 'Estas teclas te hicieron dudar:',
      slowNone: 'Limpio y constante. Veamos qué tal con el teclado completo.',
      nextBeginner: 'Tu primera lección: las seis letras más frecuentes y luego una tecla nueva cada vez.',
      ctaBeginner: 'Empezar la lección 1',
      nextFast: 'Ya escribes bastante rápido. Unas {n} palabras más en el entrenador y te saltas las teclas que ya dominas.',
      ctaFast: 'Terminar la prueba de nivel',
      again: 'Otra línea',
      lines: [
        'el veloz murciélago hindú comía feliz cardillo y kiwi',
        'quien escribe sin mirar tiene los ojos en el texto y no en las teclas',
        'cada tecla que encuentras sin mirar hace más fácil la siguiente',
      ],
    },
    method: {
      title: 'Cómo te hace más rápido',
      intro: 'No hay lecciones iguales para todos: cada ejercicio nace de cómo escribes tú.',
      items: [
        { title: 'Una tecla nueva cada vez', text: 'Las letras más frecuentes van primero, así los ejercicios parecen palabras reales desde el principio. Una tecla nueva se desbloquea cuando todas las anteriores son precisas y rápidas.' },
        { title: 'Precisión antes que velocidad', text: 'Una tecla equivocada te deja en la misma letra. Si la precisión baja, la velocidad se oculta hasta que vuelves a escribir limpio, porque los buenos hábitos son los que luego te hacen rápido.' },
        { title: 'Ejercicios para tus puntos débiles', text: 'Se mide cada pulsación. Cada ejercicio insiste en las teclas y pares de letras que te frenan y repasa las que llevas tiempo sin practicar para que no se olviden.' },
        { title: 'Rondas cortas y pausas', text: 'Cada sesión empieza con un calentamiento y combina ráfagas cortas con frases reales. Cuando empeoras, Keystrider te sugiere una pausa en lugar de repetir errores.' },
      ],
    },
    features: {
      title: 'Todo lo que necesitas, nada más',
      items: [
        { title: 'Seis idiomas, tu teclado', text: 'Practica español, inglés, alemán, francés, italiano o polaco en QWERTY, QWERTZ, AZERTY, Dvorak, Colemak y más.' },
        { title: 'Guía de dedos', text: 'Un teclado bajo el texto muestra qué dedo usar y se atenúa en las teclas que ya dominas.' },
        { title: 'Prueba de nivel', text: '¿Ya escribes algo? Una prueba de un minuto se salta las teclas que ya dominas.' },
        { title: 'Progreso visible', text: 'Velocidad y precisión a lo largo del tiempo, un mapa de errores y tus teclas y pares de letras más lentos.' },
        { title: 'Meta semanal y plan', text: 'Decide cuántas veces quieres practicar y añade el plan a tu calendario.' },
        { title: 'Privado desde el principio', text: 'Tus datos se quedan en el navegador. Una cuenta gratuita y opcional los sincroniza entre dispositivos, guardados en la UE.' },
      ],
    },
    faq: {
      title: 'Preguntas frecuentes',
      items: [
        { q: '¿Keystrider es gratis?', a: 'Sí. Practicar, ver tu progreso y la cuenta opcional son gratis y sin anuncios.' },
        { q: '¿Necesito una cuenta?', a: 'No. Puedes empezar ya; tu progreso se guarda en el navegador. Una cuenta gratuita solo añade sincronización entre dispositivos y una copia de seguridad.' },
        { q: '¿Cuánto se tarda en aprender mecanografía?', a: 'La mayoría escribe sin mirar tras unas semanas de 15 a 20 minutos al día. Sesiones cortas y diarias funcionan mejor que largas y esporádicas, y la velocidad sigue subiendo después.' },
        { q: '¿Qué distribuciones de teclado hay?', a: 'Español, QWERTY de EE. UU. y Reino Unido, QWERTZ alemán y suizo, AZERTY francés y belga, italiano, sueco/finés y polaco, Dvorak y Colemak. Keystrider detecta tu distribución por las teclas que pulsas.' },
        { q: '¿Funciona en el móvil o la tableta?', a: 'Keystrider está pensado para un teclado físico. Una tableta con teclado funciona bien; en el móvil puedes echar un vistazo, pero la mecanografía se aprende con un teclado de verdad.' },
      ],
    },
    final: { title: 'Tu primer ejercicio lleva dos minutos', text: 'Elige idioma, comprueba tu teclado y empieza a escribir.', cta: 'Empezar' },
    foot: { imprint: 'Aviso legal', privacy: 'Privacidad', terms: 'Condiciones de uso' },
  },

  fr: {
    name: 'Français',
    ogLocale: 'fr_FR',
    title: 'Apprendre la dactylographie gratuitement | Keystrider',
    description:
      'Apprenez à taper au clavier à dix doigts, gratuitement. Keystrider mesure chaque frappe, trouve les touches qui vous freinent et les travaille. Sans inscription.',
    nav: { languages: 'Langue', signIn: 'Se connecter', open: 'Ouvrir l’entraîneur' },
    hero: {
      eyebrow: 'Dactylographie gratuite · sans inscription',
      title: 'Tapez à dix doigts avec un entraîneur qui comprend vos erreurs',
      lead: 'Keystrider mesure chaque frappe, repère les touches et paires de lettres qui vous ralentissent et construit votre prochain exercice autour d’elles.',
      cta: 'Commencer gratuitement',
      note: 'Dans le navigateur. Sans publicité, sans compte.',
    },
    demo: {
      label: 'Essayez : tapez la ligne ci-dessous',
      start: 'Cliquez ici et commencez à taper',
      wpm: 'MPM',
      accuracy: 'précision',
      slowTitle: 'Ces touches vous ont fait hésiter :',
      slowNone: 'Propre et régulier. Voyons ce que ça donne avec tout le clavier.',
      nextBeginner: 'Votre première leçon : les six lettres les plus fréquentes, puis une nouvelle touche à la fois.',
      ctaBeginner: 'Commencer la leçon 1',
      nextFast: 'Vous tapez déjà assez vite. Encore environ {n} mots dans l’entraîneur, puis vous sautez les touches que vous maîtrisez.',
      ctaFast: 'Terminer le test de niveau',
      again: 'Autre ligne',
      lines: [
        'portez ce vieux whisky au juge blond qui fume',
        'taper sans regarder, c’est garder les yeux sur le texte et pas sur le clavier',
        'chaque touche trouvée sans regarder rend la suivante plus facile',
      ],
    },
    method: {
      title: 'Comment vous gagnez en vitesse',
      intro: 'Pas de leçons identiques pour tous : chaque exercice naît de votre façon de taper.',
      items: [
        { title: 'Une nouvelle touche à la fois', text: 'Les lettres les plus fréquentes viennent d’abord, pour que les exercices ressemblent vite à de vrais mots. Une nouvelle touche se débloque quand toutes les précédentes sont précises et rapides.' },
        { title: 'La précision avant la vitesse', text: 'Une mauvaise touche vous retient sur la même lettre. Si la précision baisse, la vitesse est masquée jusqu’à ce que vous tapiez proprement, car ce sont les bonnes habitudes qui rendent rapide.' },
        { title: 'Des exercices pour vos points faibles', text: 'Chaque frappe est chronométrée. Chaque exercice insiste sur les touches et paires de lettres qui vous freinent et ramène celles que vous n’avez pas travaillées depuis un moment.' },
        { title: 'Séances courtes et pauses', text: 'Une séance commence par un échauffement et alterne courtes rafales et vraies phrases. Quand votre frappe se dégrade, Keystrider propose une pause plutôt que d’ancrer les erreurs.' },
      ],
    },
    features: {
      title: 'L’essentiel, rien de plus',
      items: [
        { title: 'Six langues, votre clavier', text: 'Entraînez-vous en français, anglais, allemand, espagnol, italien ou polonais sur AZERTY, QWERTY, QWERTZ, Dvorak, Colemak et d’autres.' },
        { title: 'Guide des doigts', text: 'Un clavier sous le texte montre quel doigt utiliser et s’estompe pour les touches que vous connaissez.' },
        { title: 'Test de niveau', text: 'Vous tapez déjà un peu ? Un test d’une minute saute les touches que vous maîtrisez.' },
        { title: 'Des progrès visibles', text: 'Vitesse et précision dans le temps, une carte des erreurs et vos touches et paires de lettres les plus lentes.' },
        { title: 'Objectif et planning', text: 'Choisissez à quelle fréquence vous voulez vous entraîner et ajoutez le planning à votre agenda.' },
        { title: 'Privé par défaut', text: 'Vos données restent dans le navigateur. Un compte gratuit et facultatif les synchronise entre appareils, hébergé dans l’UE.' },
      ],
    },
    faq: {
      title: 'Questions fréquentes',
      items: [
        { q: 'Keystrider est-il gratuit ?', a: 'Oui. L’entraînement, le suivi des progrès et le compte facultatif sont gratuits et sans publicité.' },
        { q: 'Faut-il un compte ?', a: 'Non. Vous pouvez commencer tout de suite ; vos progrès sont enregistrés dans le navigateur. Un compte gratuit ajoute seulement la synchronisation entre appareils et une sauvegarde.' },
        { q: 'Combien de temps faut-il pour apprendre à taper à dix doigts ?', a: 'La plupart des gens tapent sans regarder après quelques semaines à raison de 15 à 20 minutes par jour. Des séances courtes et quotidiennes valent mieux que de longues séances rares, et la vitesse continue ensuite de progresser.' },
        { q: 'Quelles dispositions de clavier sont prises en charge ?', a: 'AZERTY français et belge, QWERTY américain et britannique, QWERTZ allemand et suisse, espagnol, italien, suédois/finnois et polonais, Dvorak et Colemak. Keystrider reconnaît votre disposition aux touches que vous tapez.' },
        { q: 'Ça marche sur téléphone ou tablette ?', a: 'Keystrider est fait pour un vrai clavier. Une tablette avec clavier fonctionne bien ; sur téléphone vous pouvez jeter un œil, mais la frappe à dix doigts s’apprend sur un clavier physique.' },
      ],
    },
    final: { title: 'Votre premier exercice prend deux minutes', text: 'Choisissez la langue, vérifiez votre clavier et tapez.', cta: 'Commencer' },
    foot: { imprint: 'Mentions légales', privacy: 'Confidentialité', terms: 'Conditions d’utilisation' },
  },

  it: {
    name: 'Italiano',
    ogLocale: 'it_IT',
    title: 'Corso di dattilografia gratis che si adatta a te | Keystrider',
    description:
      'Impara a scrivere con dieci dita, gratis e online. Keystrider misura ogni battuta, trova i tasti che ti rallentano e allena proprio quelli. Senza registrazione.',
    nav: { languages: 'Lingua', signIn: 'Accedi', open: 'Apri l’allenatore' },
    hero: {
      eyebrow: 'Dattilografia gratis · senza registrazione',
      title: 'Impara a scrivere con dieci dita con un allenatore che capisce i tuoi errori',
      lead: 'Keystrider misura ogni battuta, individua i tasti e le coppie di lettere che ti rallentano e ci costruisce sopra il tuo prossimo esercizio.',
      cta: 'Inizia gratis',
      note: 'Funziona nel browser. Niente pubblicità, nessun account.',
    },
    demo: {
      label: 'Provalo: scrivi la riga qui sotto',
      start: 'Clicca qui e inizia a scrivere',
      wpm: 'PPM',
      accuracy: 'precisione',
      slowTitle: 'Su questi tasti hai esitato:',
      slowNone: 'Pulito e regolare. Vediamo come va con tutta la tastiera.',
      nextBeginner: 'La tua prima lezione: le sei lettere più frequenti, poi un tasto nuovo alla volta.',
      ctaBeginner: 'Inizia la lezione 1',
      nextFast: 'Scrivi già piuttosto veloce. Ancora circa {n} parole nell’allenatore, poi salti i tasti che conosci già.',
      ctaFast: 'Completa il test di livello',
      again: 'Un’altra riga',
      lines: [
        'quel vituperabile xenofobo zelante assaggia il whisky ed esclama alleluja',
        'chi scrive senza guardare tiene gli occhi sul testo e non sui tasti',
        'ogni tasto che trovi senza guardare rende più facile il prossimo',
      ],
    },
    method: {
      title: 'Come diventi più veloce',
      intro: 'Niente lezioni uguali per tutti: ogni esercizio nasce da come scrivi tu.',
      items: [
        { title: 'Un tasto nuovo alla volta', text: 'Le lettere più frequenti arrivano per prime, così gli esercizi sembrano presto parole vere. Un tasto nuovo si sblocca quando tutti i precedenti sono precisi e rapidi.' },
        { title: 'Prima la precisione, poi la velocità', text: 'Un tasto sbagliato ti ferma sulla stessa lettera. Se la precisione cala, la velocità sparisce finché non scrivi di nuovo pulito, perché sono le buone abitudini a renderti veloce.' },
        { title: 'Esercizi sui tuoi punti deboli', text: 'Ogni battuta viene misurata. Ogni esercizio insiste sui tasti e le coppie di lettere che ti rallentano e riporta quelli che non alleni da un po’, perché restino.' },
        { title: 'Round brevi e pause', text: 'Ogni sessione inizia con un riscaldamento e alterna brevi raffiche a frasi vere. Quando peggiori, Keystrider ti suggerisce una pausa invece di farti ripetere gli errori.' },
      ],
    },
    features: {
      title: 'Tutto quello che serve, niente di più',
      items: [
        { title: 'Sei lingue, la tua tastiera', text: 'Allenati in italiano, inglese, tedesco, francese, spagnolo o polacco su QWERTY, QWERTZ, AZERTY, Dvorak, Colemak e altre.' },
        { title: 'Guida per le dita', text: 'Una tastiera sotto il testo mostra quale dito usare e si attenua per i tasti che conosci già.' },
        { title: 'Test di livello', text: 'Scrivi già un po’? Un test di un minuto salta i tasti che padroneggi.' },
        { title: 'Progressi visibili', text: 'Velocità e precisione nel tempo, una mappa degli errori e i tuoi tasti e coppie di lettere più lenti.' },
        { title: 'Obiettivo settimanale e piano', text: 'Scegli quanto spesso vuoi allenarti e aggiungi il piano al tuo calendario.' },
        { title: 'Privato fin dall’inizio', text: 'I tuoi dati restano nel browser. Un account gratuito e facoltativo li sincronizza tra dispositivi, conservati nell’UE.' },
      ],
    },
    faq: {
      title: 'Domande frequenti',
      items: [
        { q: 'Keystrider è gratis?', a: 'Sì. Allenamento, progressi e l’account facoltativo sono gratis e senza pubblicità.' },
        { q: 'Serve un account?', a: 'No. Puoi iniziare subito; i progressi vengono salvati nel browser. Un account gratuito aggiunge solo la sincronizzazione tra dispositivi e un backup.' },
        { q: 'Quanto ci vuole per imparare a scrivere con dieci dita?', a: 'La maggior parte delle persone scrive senza guardare dopo qualche settimana di 15–20 minuti al giorno. Sessioni brevi e quotidiane funzionano meglio di sessioni lunghe e rare, e la velocità poi continua a crescere.' },
        { q: 'Quali layout di tastiera sono supportati?', a: 'Italiano, QWERTY americano e britannico, QWERTZ tedesco e svizzero, AZERTY francese e belga, spagnolo, svedese/finlandese e polacco, Dvorak e Colemak. Keystrider riconosce il tuo layout dai tasti che premi.' },
        { q: 'Funziona su telefono o tablet?', a: 'Keystrider è pensato per una tastiera vera. Un tablet con tastiera va bene; sul telefono puoi dare un’occhiata, ma a scrivere con dieci dita si impara su una tastiera fisica.' },
      ],
    },
    final: { title: 'Il primo esercizio richiede due minuti', text: 'Scegli la lingua, controlla la tastiera e inizia a scrivere.', cta: 'Inizia' },
    foot: { imprint: 'Note legali', privacy: 'Privacy', terms: 'Condizioni d’uso' },
  },

  pl: {
    name: 'Polski',
    ogLocale: 'pl_PL',
    title: 'Nauka pisania bezwzrokowego za darmo | Keystrider',
    description:
      'Naucz się pisać bezwzrokowo, za darmo i online. Keystrider mierzy każde uderzenie, znajduje klawisze, które cię spowalniają, i ćwiczy właśnie je. Bez rejestracji.',
    nav: { languages: 'Język', signIn: 'Zaloguj się', open: 'Otwórz trenera' },
    hero: {
      eyebrow: 'Darmowy trener pisania · bez rejestracji',
      title: 'Naucz się pisać bezwzrokowo z trenerem, który rozumie twoje błędy',
      lead: 'Keystrider mierzy każde uderzenie w klawisz, wyłapuje klawisze i pary liter, które cię spowalniają, i na nich buduje kolejne ćwiczenie.',
      cta: 'Zacznij za darmo',
      note: 'Działa w przeglądarce. Bez reklam i bez konta.',
    },
    demo: {
      label: 'Spróbuj: przepisz linijkę poniżej',
      start: 'Kliknij tutaj i zacznij pisać',
      wpm: 'sł./min',
      accuracy: 'dokładność',
      slowTitle: 'Przy tych klawiszach się zawahałeś(-aś):',
      slowNone: 'Czysto i równo. Zobaczmy, jak pójdzie z całą klawiaturą.',
      nextBeginner: 'Twoja pierwsza lekcja: sześć najczęstszych liter, potem jeden nowy klawisz naraz.',
      ctaBeginner: 'Zacznij lekcję 1',
      nextFast: 'Piszesz już całkiem szybko. Jeszcze około {n} słów w trenerze, a potem pominiesz klawisze, które już znasz.',
      ctaFast: 'Dokończ test poziomujący',
      again: 'Inna linijka',
      lines: [
        'pchnąć w tę łódź jeża lub ośm skrzyń fig',
        'kto pisze bezwzrokowo, patrzy na tekst, a nie na klawisze',
        'każdy klawisz znaleziony bez patrzenia ułatwia następny',
      ],
    },
    method: {
      title: 'Jak przyspieszasz',
      intro: 'Żadnych lekcji dla wszystkich: każde ćwiczenie powstaje z tego, jak piszesz ty.',
      items: [
        { title: 'Jeden nowy klawisz naraz', text: 'Najczęstsze litery idą pierwsze, więc ćwiczenia szybko przypominają prawdziwe słowa. Nowy klawisz odblokowuje się, gdy wszystkie dotychczasowe są dokładne i szybkie.' },
        { title: 'Najpierw dokładność, potem tempo', text: 'Błędny klawisz zatrzymuje cię na tej samej literze. Gdy dokładność spada, licznik tempa znika, dopóki znów nie piszesz czysto, bo to dobre nawyki dają później szybkość.' },
        { title: 'Ćwiczenia na twoje słabe punkty', text: 'Każde uderzenie jest mierzone. Każde ćwiczenie stawia na klawisze i pary liter, które cię spowalniają, i wraca do tych, których dawno nie ćwiczyłeś(-aś), żeby zostały w pamięci.' },
        { title: 'Krótkie rundy i przerwy', text: 'Sesja zaczyna się rozgrzewką i łączy krótkie serie z prawdziwymi zdaniami. Gdy piszesz gorzej, Keystrider proponuje przerwę, zamiast utrwalać błędy.' },
      ],
    },
    features: {
      title: 'Wszystko, czego trzeba, nic ponad to',
      items: [
        { title: 'Sześć języków, twoja klawiatura', text: 'Ćwicz po polsku, angielsku, niemiecku, francusku, hiszpańsku lub włosku na QWERTY, QWERTZ, AZERTY, Dvorak, Colemak i innych.' },
        { title: 'Podpowiedź palców', text: 'Klawiatura pod tekstem pokazuje, którym palcem pisać, i przygasa przy klawiszach, które już znasz.' },
        { title: 'Test poziomujący', text: 'Już trochę piszesz? Minutowy test pomija klawisze, które opanowałeś(-aś).' },
        { title: 'Widoczne postępy', text: 'Tempo i dokładność w czasie, mapa błędów oraz twoje najwolniejsze klawisze i pary liter.' },
        { title: 'Cel tygodniowy i plan', text: 'Ustal, jak często chcesz ćwiczyć, i dodaj plan do kalendarza.' },
        { title: 'Prywatnie od początku', text: 'Twoje dane zostają w przeglądarce. Darmowe, dobrowolne konto synchronizuje je między urządzeniami, z przechowywaniem w UE.' },
      ],
    },
    faq: {
      title: 'Częste pytania',
      items: [
        { q: 'Czy Keystrider jest darmowy?', a: 'Tak. Ćwiczenia, postępy i dobrowolne konto są darmowe i bez reklam.' },
        { q: 'Czy potrzebuję konta?', a: 'Nie. Możesz zacząć od razu; postępy zapisują się w przeglądarce. Darmowe konto dodaje tylko synchronizację między urządzeniami i kopię zapasową.' },
        { q: 'Ile trwa nauka pisania bezwzrokowego?', a: 'Większość osób pisze bez patrzenia po kilku tygodniach ćwiczeń po 15–20 minut dziennie. Krótkie codzienne sesje działają lepiej niż długie i rzadkie, a tempo rośnie dalej.' },
        { q: 'Jakie układy klawiatury są obsługiwane?', a: 'Polski (programisty), amerykański i brytyjski QWERTY, niemiecki i szwajcarski QWERTZ, francuski i belgijski AZERTY, hiszpański, włoski, szwedzki/fiński, Dvorak i Colemak. Keystrider rozpoznaje układ po klawiszach, które naciskasz.' },
        { q: 'Czy działa na telefonie lub tablecie?', a: 'Keystrider jest zrobiony dla prawdziwej klawiatury. Tablet z klawiaturą sprawdza się dobrze; na telefonie możesz się rozejrzeć, ale pisania bezwzrokowego uczy się na fizycznej klawiaturze.' },
      ],
    },
    final: { title: 'Pierwsze ćwiczenie zajmie dwie minuty', text: 'Wybierz język, sprawdź klawiaturę i zacznij pisać.', cta: 'Zacznij' },
    foot: { imprint: 'Nota prawna', privacy: 'Prywatność', terms: 'Regulamin' },
  },
};
