(function () {
  const root = document.documentElement;
  const key = 'site-theme';
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => value === 'light' || value === 'dark';
  let preference = null;
  try { preference = localStorage.getItem(key); } catch (_) {}

  function apply() {
    const theme = valid(preference) ? preference : (system.matches ? 'dark' : 'light');
    root.dataset.siteTheme = theme;
    document.querySelectorAll('[data-set-theme]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.setTheme === theme));
    });
    document.dispatchEvent(new CustomEvent('site-theme-change', { detail: { theme } }));
  }

  function translate() {
    const english = root.dataset.siteLanguage === 'en';
    document.querySelectorAll('.theme-switch').forEach(control => {
      control.setAttribute('aria-label', english ? 'Appearance' : 'Darstellung');
      control.querySelector('[data-set-theme="light"]').textContent = english ? 'Light' : 'Hell';
      control.querySelector('[data-set-theme="dark"]').textContent = english ? 'Dark' : 'Dunkel';
    });
  }

  // Run in the head before the first paint, including on direct page visits.
  apply();
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.theme-switch').forEach(control => {
      control.hidden = false;
      control.addEventListener('click', event => {
        const button = event.target.closest('[data-set-theme]');
        if (!button) return;
        preference = button.dataset.setTheme;
        try { localStorage.setItem(key, preference); } catch (_) {}
        apply();
      });
    });
    translate();
    apply();
  });
  document.addEventListener('site-language-change', translate);
  system.addEventListener('change', () => { if (!valid(preference)) apply(); });
  window.addEventListener('storage', event => {
    if (event.key !== key && event.key !== null) return;
    preference = event.newValue;
    apply();
  });
})();
