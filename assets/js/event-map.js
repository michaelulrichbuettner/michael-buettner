(function () {
  const mapElement = document.querySelector("[data-event-map]");
  const statusElement = document.querySelector("[data-event-map-status]");
  const locationListElement = document.querySelector("[data-event-location-list]");
  const statsElement = document.querySelector("[data-event-stats]");
  const topicsElement = document.querySelector("[data-event-topics]");

  if (!mapElement || !statusElement || !locationListElement || !statsElement || !topicsElement) return;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value) {
    return new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(new Date(`${value}T12:00:00`));
  }

  function articleMarkup(article) {
    return `
      <li class="event-popup__article">
        <time datetime="${escapeHtml(article.date)}">${formatDate(article.date)}</time>
        <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(article.title)} bei inside digital öffnen">
          ${escapeHtml(article.title)}
        </a>
      </li>
    `;
  }

  function popupMarkup(event) {
    const count = event.articles.length;
    return `
      <section class="event-popup">
        <header class="event-popup__header">
          <p>${escapeHtml(event.location)}</p>
          <h2>${escapeHtml(event.name)}</h2>
          <span>${count} ${count === 1 ? "Artikel" : "Artikel"}</span>
        </header>
        <ol class="event-popup__articles">${event.articles.map(articleMarkup).join("")}</ol>
      </section>
    `;
  }

  function renderStatistics(statistics) {
    statsElement.innerHTML = `
      <span><strong>${statistics.includedArticles}</strong> Artikel eingebaut</span>
      <span><strong>${statistics.eventLocations}</strong> Event-Orte</span>
      <span><strong>${statistics.remainingRelevantArticles}</strong> Artikel für das Themen-Visual vorgemerkt</span>
    `;

    topicsElement.innerHTML = `
      <p>${statistics.remainingRelevantArticles} relevante Artikel sind keinem der sieben Event-Orte zugeordnet und bleiben für das zweite Visual vorgemerkt.</p>
      <ul>
        ${statistics.remainingTopics
          .map((topic) => `<li><span>${escapeHtml(topic.name)}</span><strong>${topic.count}</strong></li>`)
          .join("")}
      </ul>
      <p class="event-topics__note">Zusätzlich liegen ${statistics.olderEventArticles} relevante Event-Artikel außerhalb des hier verwendeten Zeitraums.</p>
    `;
  }

  async function initializeMap() {
    if (typeof window.L === "undefined" || typeof window.topojson === "undefined") {
      throw new Error("Die Kartenbibliothek konnte nicht geladen werden.");
    }

    const [dataResponse, worldResponse] = await Promise.all([
      fetch(mapElement.dataset.source, { cache: "no-store" }),
      fetch(mapElement.dataset.world, { cache: "force-cache" })
    ]);

    if (!dataResponse.ok || !worldResponse.ok) {
      throw new Error("Die Kartendaten konnten nicht geladen werden.");
    }

    const payload = await dataResponse.json();
    const world = await worldResponse.json();
    const events = Array.isArray(payload.events) ? payload.events : [];

    if (!events.length || !world.objects?.countries) {
      throw new Error("Für die Karte liegen keine vollständigen Daten vor.");
    }

    renderStatistics(payload.statistics);

    const styles = getComputedStyle(document.documentElement);
    const colors = {
      ink: styles.getPropertyValue("--color-ink").trim(),
      line: styles.getPropertyValue("--color-line").trim(),
      soft: styles.getPropertyValue("--color-soft").trim(),
      yellow: styles.getPropertyValue("--color-yellow").trim()
    };

    const map = window.L.map(mapElement, {
      attributionControl: false,
      center: [24, 0],
      maxBounds: [[-85, -220], [85, 220]],
      maxBoundsViscosity: 0.9,
      maxZoom: 7,
      minZoom: 1,
      scrollWheelZoom: false,
      zoomControl: true,
      zoomSnap: 0.25
    });

    const countries = window.topojson.feature(world, world.objects.countries);
    window.L.geoJSON(countries, {
      interactive: false,
      style: {
        color: colors.line,
        fillColor: colors.soft,
        fillOpacity: 1,
        weight: 0.8
      }
    }).addTo(map);

    map.fitBounds([[-58, -175], [78, 180]], { animate: false, padding: [12, 12] });

    const markers = new Map();

    function selectEvent(event, shouldZoom) {
      const marker = markers.get(event.id);
      if (!marker) return;

      locationListElement.querySelectorAll("button").forEach((button) => {
        const isSelected = button.dataset.eventId === event.id;
        button.classList.toggle("is-active", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      });

      if (shouldZoom && map.getZoom() < 4) {
        map.flyTo([event.latitude, event.longitude], 4, { duration: 0.55 });
      }
      marker.openPopup();
    }

    events.forEach((event) => {
      const count = event.articles.length;
      const icon = window.L.divIcon({
        className: "event-map-marker",
        html: `<span class="event-map-marker__pin"><span>${count}</span></span>`,
        iconAnchor: [18, 18],
        iconSize: [36, 36],
        popupAnchor: [0, -16]
      });
      const marker = window.L.marker([event.latitude, event.longitude], {
        icon,
        keyboard: true,
        riseOnHover: true,
        title: `${event.name}, ${event.location}: ${count} Artikel`
      })
        .addTo(map)
        .bindPopup(popupMarkup(event), {
          className: "event-map-popup",
          maxWidth: 440,
          minWidth: 280
        });

      marker.on("click", () => selectEvent(event, true));
      marker.on("popupclose", () => {
        locationListElement.querySelectorAll("button").forEach((button) => {
          button.classList.remove("is-active");
          button.setAttribute("aria-pressed", "false");
        });
      });
      markers.set(event.id, marker);
    });

    locationListElement.innerHTML = events
      .map((event) => `
        <button type="button" data-event-id="${escapeHtml(event.id)}" aria-pressed="false">
          <span>${escapeHtml(event.name)}</span>
          <small>${escapeHtml(event.location)} · ${event.articles.length}</small>
        </button>
      `)
      .join("");

    locationListElement.addEventListener("click", (clickEvent) => {
      const button = clickEvent.target.closest("button[data-event-id]");
      if (!button) return;
      const event = events.find((item) => item.id === button.dataset.eventId);
      if (event) selectEvent(event, true);
    });

    statusElement.textContent = "Punkt oder Event auswählen, um die zugehörigen Artikel zu öffnen.";
    window.setTimeout(() => map.invalidateSize(), 0);
  }

  initializeMap().catch((error) => {
    mapElement.hidden = true;
    locationListElement.hidden = true;
    statsElement.hidden = true;
    topicsElement.closest("details").hidden = true;
    statusElement.classList.add("event-map-status--error");
    statusElement.textContent = error.message;
  });
})();
