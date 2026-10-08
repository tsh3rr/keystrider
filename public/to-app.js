// Runs before the landing page draws (see src/landing/render.ts). Someone who
// has already set up the trainer in this browser goes straight on to it, and
// so do sign-in links and invite links that still point at the front page.
// ?home keeps a returning learner on the landing page.
(function () {
  try {
    var q = location.search;
    var h = location.hash;
    var link = /[?&](code|invite|error_description)=/.test(q) || /(access_token|error_description)=/.test(h);
    var returning = localStorage.getItem('typing-trainer.onboarded') === '1' || localStorage.getItem('typing-trainer.language') !== null;
    if (link || (returning && !/[?&]home(=|&|$)/.test(q))) location.replace('/app/' + q + h);
  } catch (e) {
    // Storage blocked: stay on the landing page.
  }
})();
