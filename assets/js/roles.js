(function () {
  const root = document.querySelector('[data-roles]');
  const roles = window.siteRoles;
  if (!root || !Array.isArray(roles) || !roles.length) return;
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };
  const controls = element('div', 'roles__controls');
  const previous = element('button', 'roles__arrow', '←');
  const next = element('button', 'roles__arrow', '→');
  previous.type = next.type = 'button';
  previous.setAttribute('aria-label', 'Vorherige Rolle / Previous role');
  next.setAttribute('aria-label', 'Nächste Rolle / Next role');
  const position = element('span', 'roles__position');
  position.setAttribute('aria-live', 'polite');
  position.setAttribute('aria-atomic', 'true');
  controls.append(previous, position, next);
  const viewport = element('div', 'roles__viewport');
  viewport.id = 'role-cards';
  previous.setAttribute('aria-controls', viewport.id);
  next.setAttribute('aria-controls', viewport.id);
  const cards = roles.map((role, index) => {
    const card = element('article', 'role-card');
    card.setAttribute('aria-roledescription', 'Karte / Slide');
    card.setAttribute('aria-label', `${index + 1} / ${roles.length}`);
    const columns = element('div', 'role-card__columns');
    ['de', 'en'].forEach(lang => {
      const content = role[lang];
      const column = element('div', 'role-card__language');
      column.lang = lang;
      column.dataset.language = lang;
      column.append(element('h3', 'role-card__title', content.title));
      column.append(element('h4', 'role-card__label', lang === 'de' ? 'Verantwortung' : 'Responsibility'));
      column.append(element('p', 'role-card__responsibility', content.responsibility));
      column.append(element('h4', 'role-card__label', lang === 'de' ? 'Tätigkeiten' : 'Activities'));
      const list = element('ul', 'role-card__activities');
      content.activities.forEach(activity => list.append(element('li', '', activity)));
      column.append(list);
      const success = element('div', 'role-card__success');
      success.append(element('h4', 'role-card__label', lang === 'de' ? (content.success.includes(';') ? 'Erfolge' : 'Erfolg') : 'Results'));
      success.append(element('p', '', content.success));
      column.append(success);
      if (role.url) {
        const link = element('a', 'button button--secondary', content.articleTitle);
        // Same-site links remain local in previews, with the site's normal same-tab behaviour.
        const url = new URL(role.url, location.href);
        link.href = url.hostname === 'michael-buettner.eu' ? url.pathname + url.search + url.hash : url.href;
        column.append(link);
      }
      columns.append(column);
    });
    card.append(columns);
    viewport.append(card);
    return card;
  });
  root.replaceChildren(controls, viewport);
  let current = 0;
  function show(index) {
    current = (index + cards.length) % cards.length;
    // Move focus out before making a previously active link inert.
    if (viewport.contains(document.activeElement)) next.focus({preventScroll: true});
    cards.forEach((card, i) => {
      const active = i === current;
      card.dataset.position = active ? 'active' : i === (current + cards.length - 1) % cards.length ? 'previous' : i === (current + 1) % cards.length ? 'next' : 'hidden';
      card.inert = !active;
      card.setAttribute('aria-hidden', String(!active));
    });
    position.textContent = `${current + 1} / ${cards.length}`;
    position.setAttribute('aria-label', `${current + 1} / ${cards.length}: ${roles[current][document.documentElement.dataset.siteLanguage || 'de'].title}`);
  }
  previous.addEventListener('click', () => show(current - 1));
  next.addEventListener('click', () => show(current + 1));
  root.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    show(event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : current + (event.key === 'ArrowRight' ? 1 : -1));
  });
  let gesture = null;
  viewport.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    gesture = {id: event.pointerId, x: event.clientX, y: event.clientY};
  });
  viewport.addEventListener('pointerup', event => {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) show(current + (dx < 0 ? 1 : -1));
  });
  viewport.addEventListener('pointercancel', () => { gesture = null; });
  previous.disabled = next.disabled = cards.length < 2;
  function updateLanguage() {
    const lang = document.documentElement.dataset.siteLanguage || 'de';
    previous.setAttribute('aria-label', lang === 'de' ? 'Vorherige Rolle' : 'Previous role');
    next.setAttribute('aria-label', lang === 'de' ? 'Nächste Rolle' : 'Next role');
    root.setAttribute('aria-labelledby', 'roles-heading-' + lang);
    root.setAttribute('aria-roledescription', lang === 'de' ? 'Karussell' : 'Carousel');
    cards.forEach(card => card.setAttribute('aria-roledescription', lang === 'de' ? 'Karte' : 'Slide'));
    show(current);
  }
  document.addEventListener('site-language-change', updateLanguage);
  updateLanguage();
})();
