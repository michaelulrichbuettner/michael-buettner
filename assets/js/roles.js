(function () {
  const root = document.querySelector('[data-roles]');
  if (!root) return;
  const viewport = root.querySelector('.roles__viewport');
  const cards = [...root.querySelectorAll('.role-card')];
  if (!viewport || !cards.length) return;
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
  previous.setAttribute('aria-controls', viewport.id);
  next.setAttribute('aria-controls', viewport.id);
  root.prepend(controls);
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
    position.setAttribute('aria-label', `${current + 1} / ${cards.length}: ${cards[current].querySelector('[data-language="' + (document.documentElement.dataset.siteLanguage || 'de') + '"] .role-card__title').textContent}`);
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
  root.classList.add('is-enhanced');
})();
