(function () {


  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });

  // Cards are present in the delivered HTML; JavaScript only filters them.
  document.querySelectorAll('[data-tag-filter]').forEach(filter => {
    const postTarget = document.querySelector('[data-all-posts]');
    if (!postTarget) return;
    const cards = [...postTarget.querySelectorAll('.post-card')];
    const tagsByCard = cards.map(card => JSON.parse(card.dataset.postTags || '[]'));
    const tags = ['Alle', ...new Set(tagsByCard.flat())];
    filter.replaceChildren(...tags.map((tag, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tag-button' + (index === 0 ? ' is-active' : '');
      button.dataset.tag = tag;
      button.textContent = tag;
      button.setAttribute('aria-pressed', String(index === 0));
      return button;
    }));
    filter.hidden = false;
    filter.addEventListener('click', event => {
      const button = event.target.closest('button[data-tag]');
      if (!button) return;
      filter.querySelectorAll('button').forEach(node => {
        node.classList.toggle('is-active', node === button);
        node.setAttribute('aria-pressed', String(node === button));
      });
      cards.forEach((card, index) => {
        card.hidden = button.dataset.tag !== 'Alle' && !tagsByCard[index].includes(button.dataset.tag);
      });
    });
  });

  document.querySelectorAll(".visual-card img").forEach((image) => {
    image.addEventListener("click", () => {
      const card = image.closest(".visual-card");
      const mediaGrid = image.closest(".visual-card__media-grid");
      if (!card) return;

      const isExpanded = image.classList.contains("is-expanded-image");

      document.querySelectorAll(".visual-card--image-expanded").forEach((expandedCard) => {
        expandedCard.classList.remove("visual-card--image-expanded");
        expandedCard.querySelectorAll(".is-expanded-image").forEach((node) => {
          node.classList.remove("is-expanded-image");
        });
        expandedCard.querySelectorAll(".is-image-expanded").forEach((node) => {
          node.classList.remove("is-image-expanded");
        });
      });

      if (isExpanded) return;

      card.classList.add("visual-card--image-expanded");
      image.classList.add("is-expanded-image");
      if (mediaGrid) {
        mediaGrid.classList.add("is-image-expanded");
      }
    });
  });

  document.querySelectorAll("[data-contact-form]").forEach((form) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      const recipient = "michael.ulrich.buettner@gmail.com";
      const email = form.elements.email.value.trim();
      const message = form.elements.message.value.trim();
      const subject = "Kontakt über michael-buettner.eu";
      const body = [
        "Absender:",
        email,
        "",
        "Nachricht:",
        message
      ].join("\n");
      const mailtoUrl = `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      const status = form.querySelector("[data-contact-status]");

      if (status) {
        status.hidden = false;
        status.textContent = "";

        const text = document.createElement("p");
        text.textContent = "Wenn sich dein E-Mail-Programm nicht automatisch öffnet, nutze diesen vorbereiteten Link:";

        const link = document.createElement("a");
        link.className = "button button--secondary";
        link.href = mailtoUrl;
        link.title = "Vorbereitete E-Mail an Michael Büttner öffnen";
        link.textContent = "E-Mail jetzt öffnen";

        status.append(text, link);
      }

      window.location.assign(mailtoUrl);
    });
  });
})();
