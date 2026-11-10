(function () {
  const key = 'site-language';
  const root = document.documentElement;
  let language = 'de';
  try {
    if (localStorage.getItem(key) === 'en') language = 'en';
  } catch (_) { /* The switch also works when browser storage is unavailable. */ }

  function apply(value) {
    language = value === 'en' ? 'en' : 'de';
    root.dataset.siteLanguage = language;
    root.lang = language;
    document.querySelectorAll('[data-set-language]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.setLanguage === language));
    });
    document.dispatchEvent(new CustomEvent('site-language-change', {detail: {language}}));
  }
  apply(language);
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.language-switch').forEach(control => {
      control.hidden = false;
      control.addEventListener('click', event => {
        const button = event.target.closest('[data-set-language]');
        if (!button) return;
        apply(button.dataset.setLanguage);
        try { localStorage.setItem(key, language); } catch (_) {}
      });
    });
    apply(language);
  });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
