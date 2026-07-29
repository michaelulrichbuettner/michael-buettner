(function () {
  const mapElement = document.querySelector("[data-bird-map]");
  const statusElement = document.querySelector("[data-bird-map-status]");
  const summaryElement = document.querySelector("[data-bird-map-summary]");
  const listElement = document.querySelector("[data-bird-city-list]");

  if (!mapElement || !statusElement || !summaryElement || !listElement) return;

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

  function groupByCity(observations) {
    return observations.reduce((groups, observation) => {
      if (!groups.has(observation.city)) {
        groups.set(observation.city, {
          city: observation.city,
          latitude: observation.latitude,
          longitude: observation.longitude,
          observations: []
        });
      }
      groups.get(observation.city).observations.push(observation);
      return groups;
    }, new Map());
  }

  function uniqueSpecies(observations) {
    const species = new Map();

    observations.forEach((observation) => {
      const key = `${observation.commonName}|${observation.scientificName}`;
      const existing = species.get(key);
      if (!existing || observation.date < existing.date) {
        species.set(key, observation);
      }
    });

    return [...species.values()].sort((a, b) =>
      a.commonName.localeCompare(b.commonName, "de")
    );
  }

  function speciesListMarkup(observations) {
    return uniqueSpecies(observations)
      .map(
        (observation) => `
          <li>
            <strong>${escapeHtml(observation.commonName)}</strong>
            <em>${escapeHtml(observation.scientificName)}</em>
            <time datetime="${observation.date}">${formatDate(observation.date)}</time>
          </li>
        `
      )
      .join("");
  }

  function cityCardMarkup(group) {
    const species = uniqueSpecies(group.observations);
    return `
      <article class="bird-city-card">
        <div class="bird-city-card__heading">
          <h2>${escapeHtml(group.city)}</h2>
          <span>${species.length} ${species.length === 1 ? "Art" : "Arten"}</span>
        </div>
        <ul class="bird-species-list">${speciesListMarkup(group.observations)}</ul>
      </article>
    `;
  }

  async function initializeMap() {
    if (typeof window.L === "undefined") {
      throw new Error("Die Kartenbibliothek konnte nicht geladen werden.");
    }

    const response = await fetch(mapElement.dataset.source, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Die Vogeldaten konnten nicht geladen werden (${response.status}).`);
    }

    const payload = await response.json();
    const observations = Array.isArray(payload.observations)
      ? payload.observations
      : [];

    if (!observations.length) {
      throw new Error("Noch keine Vogelbeobachtungen vorhanden.");
    }

    const cityGroups = [...groupByCity(observations).values()].sort((a, b) =>
      a.city.localeCompare(b.city, "de")
    );
    const speciesCount = uniqueSpecies(observations).length;

    summaryElement.innerHTML = `
      <strong>${speciesCount}</strong>
      <span>${speciesCount === 1 ? "Vogelart" : "Vogelarten"}</span>
      <strong>${cityGroups.length}</strong>
      <span>${cityGroups.length === 1 ? "Stadt" : "Städte"}</span>
    `;

    listElement.innerHTML = cityGroups.map(cityCardMarkup).join("");

    const map = window.L.map(mapElement, {
      scrollWheelZoom: false,
      zoomControl: true
    });

    window.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap-Mitwirkende</a>'
    }).addTo(map);

    const bounds = [];

    cityGroups.forEach((group) => {
      const species = uniqueSpecies(group.observations);
      const radius = Math.min(30, 10 + Math.sqrt(species.length) * 4);
      const position = [group.latitude, group.longitude];
      bounds.push(position);

      const popup = document.createElement("section");
      popup.className = "bird-popup";
      popup.innerHTML = `
        <h2>${escapeHtml(group.city)}</h2>
        <p>${species.length} ${species.length === 1 ? "Vogelart" : "Vogelarten"}</p>
        <ul class="bird-species-list">${speciesListMarkup(group.observations)}</ul>
      `;

      window.L.circleMarker(position, {
        radius,
        color: "#171717",
        weight: 2,
        fillColor: "#f1d46b",
        fillOpacity: 0.9
      })
        .addTo(map)
        .bindPopup(popup, { maxWidth: 360, minWidth: 250 });
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 11);
    } else {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 11 });
    }

    statusElement.textContent =
      "Die Markerpositionen zeigen Stadtmittelpunkte, keine exakten Beobachtungsorte.";
  }

  initializeMap().catch((error) => {
    mapElement.hidden = true;
    statusElement.classList.add("bird-map-status--error");
    statusElement.textContent = error.message;
  });
})();
