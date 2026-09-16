(function () {
  const mapElement = document.querySelector("[data-event-map]");
  const statusElement = document.querySelector("[data-event-map-status]");
  const locationListElement = document.querySelector("[data-event-location-list]");

  if (!mapElement || !statusElement || !locationListElement) return;

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
    const isArchive = article.url.startsWith("https://web.archive.org/");
    const linkTitle = isArchive
      ? `${article.title} als Archivfassung öffnen`
      : `${article.title} bei inside digital öffnen`;
    return `
      <li class="event-popup__article">
        <time datetime="${escapeHtml(article.date)}">${formatDate(article.date)}</time>
        ${isArchive ? '<span class="event-popup__archive-label">Archivfassung</span>' : ""}
        <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(linkTitle)}">
          ${escapeHtml(article.title)}
        </a>
      </li>
    `;
  }

  function popupMarkup(events) {
    return `
      <section class="event-popup">
        ${events.map((event) => `
        <section class="event-popup__group" aria-label="${escapeHtml(event.name)}">
        <header class="event-popup__header">
          <p>${escapeHtml(event.location)}</p>
          <h2>${escapeHtml(event.name)}</h2>
          <span>${event.articles.length} Artikel</span>
        </header>
        <ol class="event-popup__articles">${event.articles.map(articleMarkup).join("")}</ol>
        </section>
        `).join("")}
      </section>
    `;
  }

  function unwrapRing(ring) {
    let offset = 0;
    let previousLongitude = ring[0]?.[0] || 0;

    return ring.map((position, index) => {
      let longitude = position[0] + offset;
      if (index > 0) {
        const difference = longitude - previousLongitude;
        if (difference > 180) {
          offset -= 360;
          longitude -= 360;
        } else if (difference < -180) {
          offset += 360;
          longitude += 360;
        }
      }
      previousLongitude = longitude;
      return [longitude, position[1]];
    });
  }

  function unwrapGeometry(geometry) {
    if (!geometry) return geometry;
    if (geometry.type === "Polygon") {
      return { ...geometry, coordinates: geometry.coordinates.map(unwrapRing) };
    }
    if (geometry.type === "MultiPolygon") {
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon) => polygon.map(unwrapRing))
      };
    }
    return geometry;
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
    const leafletCountries = {
      ...countries,
      features: countries.features
        .filter((feature) => feature.properties?.name !== "Antarctica")
        .map((feature) => ({ ...feature, geometry: unwrapGeometry(feature.geometry) }))
    };
    window.L.geoJSON(leafletCountries, {
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

    function selectEvents(selectedEvents, shouldZoom) {
      const event = selectedEvents[0];
      const marker = markers.get(event.id);
      if (!marker) return;

      if (shouldZoom && map.getZoom() < 4) {
        map.flyTo([event.latitude, event.longitude], 4, { duration: 0.55 });
      }
      marker.setPopupContent(popupMarkup(selectedEvents)).openPopup();
      locationListElement.querySelectorAll("button").forEach((button) => {
        const isSelected = selectedEvents.some((item) => item.id === button.dataset.eventId);
        button.classList.toggle("is-active", isSelected);
        button.setAttribute("aria-pressed", String(isSelected));
      });
    }

    // Events in the same city share a marker but remain separately selectable below.
    const locations = new Map();
    events.forEach((event) => {
      const key = `${event.latitude},${event.longitude}`;
      if (!locations.has(key)) locations.set(key, []);
      locations.get(key).push(event);
    });

    locations.forEach((locationEvents) => {
      const event = locationEvents[0];
      const count = locationEvents.reduce((sum, item) => sum + item.articles.length, 0);
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
        title: `${locationEvents.map((item) => item.name).join(" · ")}, ${event.location}: ${count} Artikel`
      })
        .addTo(map)
        .bindPopup(popupMarkup(locationEvents), {
          className: "event-map-popup",
          maxWidth: 440,
          minWidth: 280
        });

      marker.on("click", () => selectEvents(locationEvents, true));
      marker.on("keypress", (keyEvent) => {
        if (keyEvent.originalEvent.key === "Enter") selectEvents(locationEvents, true);
      });
      marker.on("popupclose", () => {
        locationListElement.querySelectorAll("button").forEach((button) => {
          button.classList.remove("is-active");
          button.setAttribute("aria-pressed", "false");
        });
      });
      locationEvents.forEach((item) => markers.set(item.id, marker));
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
      if (event) selectEvents([event], true);
    });

    statusElement.textContent = "Punkt oder Event auswählen, um die zugehörigen Artikel zu öffnen.";
    window.setTimeout(() => map.invalidateSize(), 0);
  }

  initializeMap().catch((error) => {
    mapElement.hidden = true;
    locationListElement.hidden = true;
    statusElement.classList.add("event-map-status--error");
    statusElement.textContent = error.message;
  });
})();
