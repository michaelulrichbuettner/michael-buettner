(function () {
  const posts = Array.isArray(window.sitePosts) ? window.sitePosts : [];

  document.querySelectorAll("[data-current-year]").forEach((node) => {
    node.textContent = new Date().getFullYear();
  });

  function formatDate(value) {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(new Date(value));
  }

  function postCard(post) {
    const tags = post.tags.map((tag) => `<span class="tag">${tag}</span>`).join("");
    const linkTitle = `${post.title} lesen`;
    const imageAlt = post.imageAlt || `Vorschaubild zum Beitrag ${post.title}`;
    const image = post.image
      ? `<a class="post-card__image" href="${post.url}" title="${linkTitle}" aria-hidden="true" tabindex="-1"><img src="${post.image}" alt="${imageAlt}" title="${imageAlt}"></a>`
      : "";
    return `
      <article class="post-card">
        ${image}
        <div class="post-card__meta">${formatDate(post.date)}${tags ? `<span class="post-card__tags">${tags}</span>` : ""}</div>
        <h2><a href="${post.url}" title="${linkTitle}">${post.title}</a></h2>
        <p>${post.excerpt}</p>
      </article>
    `;
  }

  function renderPosts(target, items) {
    target.innerHTML = items.length
      ? items.map(postCard).join("")
      : '<p class="empty-state">Noch keine Beiträge in dieser Auswahl.</p>';
  }

  const sortedPosts = posts
    .filter((post) => post.lang === "de")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  document.querySelectorAll("[data-latest-posts]").forEach((target) => {
    const limit = Number(target.dataset.latestPosts || 3);
    renderPosts(target, sortedPosts.slice(0, limit));
  });

  document.querySelectorAll("[data-work-samples]").forEach((target) => {
    renderPosts(target, sortedPosts.filter((post) => post.workSample));
  });

  document.querySelectorAll("[data-all-posts]").forEach((target) => {
    renderPosts(target, sortedPosts);
  });

  document.querySelectorAll("[data-tag-filter]").forEach((filter) => {
    const postTarget = document.querySelector("[data-all-posts]");
    const tags = ["Alle", ...new Set(sortedPosts.flatMap((post) => post.tags))];

    filter.innerHTML = tags
      .map((tag, index) => `<button class="tag-button${index === 0 ? " is-active" : ""}" type="button" data-tag="${tag}">${tag}</button>`)
      .join("");

    filter.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-tag]");
      if (!button || !postTarget) return;

      filter.querySelectorAll(".tag-button").forEach((node) => node.classList.remove("is-active"));
      button.classList.add("is-active");

      const tag = button.dataset.tag;
      const filteredPosts = tag === "Alle"
        ? sortedPosts
        : sortedPosts.filter((post) => post.tags.includes(tag));

      renderPosts(postTarget, filteredPosts);
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
      const subject = "Kontakt über michael-buettner.de";
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
