(function () {
  document.querySelectorAll("[data-sort-experiments]").forEach((list) => {
    const cards = Array.from(list.children).filter((node) => node.matches(".showcase-card"));
    const updatedAt = (card) => Date.parse(card.dataset.updated || "") || 0;
    cards.sort((a, b) => updatedAt(b) - updatedAt(a));
    // Move existing elements so their content and event listeners are preserved.
    cards.forEach((card) => list.appendChild(card));
  });
})();
