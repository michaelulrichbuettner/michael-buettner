(function () {
  const root = document.querySelector("[data-ki-space]");
  if (!root) return;

  const elements = {
    searchForm: root.querySelector("[data-ki-search]"),
    searchInput: root.querySelector("[data-ki-search] input"),
    topics: root.querySelector("[data-ki-topics]"),
    browser: root.querySelector("[data-ki-browser]"),
    selectionTitle: root.querySelector("[data-ki-selection-title]"),
    filters: root.querySelector("[data-ki-filters]"),
    status: root.querySelector("[data-ki-status]"),
    entities: root.querySelector("[data-ki-entities]"),
    detail: root.querySelector("[data-ki-detail]"),
    overview: root.querySelector("[data-ki-overview]"),
    message: root.querySelector("[data-ki-message]")
  };

  let topics = [];
  let selectedTopic = null;
  let selectedFilter = "all";
  let selectedEntity = null;
  let query = "";
  let searchResults = [];

  const normalize = (value) => String(value || "").toLocaleLowerCase("de-DE").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  function allEntities() {
    return topics.flatMap((topic) => topic.filters.flatMap((filter) => filter.entities.map((entity) => ({ topic, filter, entity }))));
  }

  function findByPath(topicId, filterId, entityId) {
    const topic = topics.find((item) => item.id === topicId);
    const filter = topic?.filters.find((item) => item.id === filterId);
    const entity = filter?.entities.find((item) => item.id === entityId);
    return topic && filter && entity ? { topic, filter, entity } : null;
  }

  function writeHash() {
    const path = selectedEntity
      ? `${selectedTopic.id}/${selectedEntity.filter.id}/${selectedEntity.entity.id}`
      : selectedTopic ? selectedTopic.id : "";
    const next = path ? `#${path}` : window.location.pathname + window.location.search;
    if (window.location.hash !== (path ? `#${path}` : "")) history.pushState(null, "", next);
  }

  function entitySearchText(item) {
    return normalize([item.name, item.type, item.description, item.importance, item.source, ...(item.relatedTopics || [])].join(" "));
  }

  function renderTopics() {
    elements.topics.replaceChildren(...topics.map((topic) => {
      const button = document.createElement("button");
      button.className = "ki-topic";
      button.type = "button";
      button.setAttribute("aria-pressed", String(selectedTopic?.id === topic.id));
      const icon = document.createElement("span");
      icon.className = "ki-topic__icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = topic.icon;
      const label = document.createElement("span");
      label.textContent = topic.title;
      button.append(icon, label);
      button.addEventListener("click", () => selectTopic(topic));
      return button;
    }));
  }

  function selectTopic(topic, updateUrl = true) {
    selectedTopic = topic;
    selectedFilter = "all";
    selectedEntity = null;
    query = "";
    elements.searchInput.value = "";
    elements.browser.hidden = false;
    elements.selectionTitle.textContent = topic.title;
    elements.detail.hidden = true;
    renderTopics();
    renderFilters();
    renderEntities();
    if (updateUrl) writeHash();
    elements.browser.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  }

  function renderFilters() {
    const filters = [{ id: "all", title: "Alle" }, ...selectedTopic.filters];
    elements.filters.replaceChildren(...filters.map((filter) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ki-filter${selectedFilter === filter.id ? " is-active" : ""}`;
      button.textContent = filter.title;
      button.setAttribute("aria-pressed", String(selectedFilter === filter.id));
      button.addEventListener("click", () => {
        selectedFilter = filter.id;
        selectedEntity = null;
        elements.detail.hidden = true;
        renderFilters();
        renderEntities();
        writeHash();
      });
      return button;
    }));
  }

  function currentEntities() {
    if (!selectedTopic) return [];
    if (selectedTopic.id === "search") return searchResults;
    return selectedTopic.filters
      .filter((filter) => selectedFilter === "all" || filter.id === selectedFilter)
      .flatMap((filter) => filter.entities.map((entity) => ({ filter, entity })))
      .filter(({ entity }) => !query || entitySearchText(entity).includes(normalize(query)));
  }

  function renderEntities() {
    const items = currentEntities();
    elements.entities.replaceChildren(...items.map((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `ki-entity${selectedEntity?.entity === item.entity ? " is-active" : ""}`;
      button.setAttribute("aria-pressed", String(selectedEntity?.entity === item.entity));
      const name = document.createElement("strong");
      name.textContent = item.entity.name;
      const type = document.createElement("span");
      type.textContent = item.entity.type;
      button.append(name, type);
      button.addEventListener("click", () => showDetail(item));
      return button;
    }));
    elements.status.textContent = items.length === 1 ? "1 Eintrag" : `${items.length} Einträge`;
    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "ki-space__empty";
      empty.textContent = "Keine passenden Einträge gefunden.";
      elements.entities.append(empty);
    }
  }

  function addDetailSection(container, headingText, text) {
    if (!text) return;
    const heading = document.createElement("h3");
    heading.textContent = headingText;
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    container.append(heading, paragraph);
  }

  function showDetail(item, updateUrl = true) {
    if (item.topic && selectedTopic?.id === "search") {
      selectedTopic = item.topic;
      selectedFilter = item.filter.id;
      query = "";
      elements.searchInput.value = "";
      elements.selectionTitle.textContent = item.topic.title;
      renderTopics();
      renderFilters();
    }
    selectedEntity = item;
    renderEntities();
    const entity = item.entity;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "ki-detail__close";
    close.textContent = "Schließen";
    close.addEventListener("click", () => {
      selectedEntity = null;
      elements.detail.hidden = true;
      renderEntities();
      writeHash();
    });
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = entity.type;
    const title = document.createElement("h2");
    title.textContent = entity.name;
    const body = document.createElement("div");
    body.className = "ki-detail__body";
    addDetailSection(body, "Kurzbeschreibung", entity.description);
    addDetailSection(body, "Warum wichtig?", entity.importance);
    if (entity.source || entity.url) {
      const heading = document.createElement("h3");
      heading.textContent = "Quelle";
      body.append(heading);
      if (entity.url) {
        const link = document.createElement("a");
        link.className = "ki-detail__source";
        link.href = entity.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = entity.source || "Quelle öffnen";
        body.append(link);
      } else {
        const text = document.createElement("p");
        text.textContent = entity.source;
        body.append(text);
      }
    }
    if (entity.relatedTopics?.length) {
      const heading = document.createElement("h3");
      heading.textContent = "Verwandte Themen";
      const list = document.createElement("div");
      list.className = "ki-detail__related";
      entity.relatedTopics.forEach((related) => {
        const match = allEntities().find((candidate) => normalize(candidate.entity.name) === normalize(related));
        const chip = document.createElement(match ? "button" : "span");
        chip.className = "ki-related";
        chip.textContent = related;
        if (match) {
          chip.type = "button";
          chip.addEventListener("click", () => {
            selectedTopic = match.topic;
            selectedFilter = match.filter.id;
            elements.selectionTitle.textContent = match.topic.title;
            renderTopics();
            renderFilters();
            showDetail({ filter: match.filter, entity: match.entity });
          });
        }
        list.append(chip);
      });
      body.append(heading, list);
    }
    const updated = document.createElement("p");
    updated.className = "ki-detail__updated";
    updated.textContent = `Stand: ${entity.updated || "nicht angegeben"}`;
    elements.detail.replaceChildren(close, eyebrow, title, body, updated);
    elements.detail.hidden = false;
    if (updateUrl) writeHash();
  }

  function searchAcrossTopics() {
    query = elements.searchInput.value.trim();
    if (!query) {
      if (selectedTopic) renderEntities();
      return;
    }
    searchResults = allEntities().filter(({ entity }) => entitySearchText(entity).includes(normalize(query)));
    selectedTopic = {
      id: "search",
      title: `Suchergebnisse für „${query}“`,
      filters: []
    };
    selectedFilter = "all";
    selectedEntity = null;
    elements.browser.hidden = false;
    elements.selectionTitle.textContent = selectedTopic.title;
    elements.detail.hidden = true;
    renderFilters();
    renderEntities();
  }

  function restoreHash() {
    const parts = decodeURIComponent(location.hash.slice(1)).split("/").filter(Boolean);
    if (!parts.length) return;
    const topic = topics.find((item) => item.id === parts[0]);
    if (!topic) {
      elements.message.hidden = false;
      elements.message.textContent = "Der angeforderte Direktlink ist nicht bekannt. Die Themenübersicht wird angezeigt.";
      return;
    }
    selectTopic(topic, false);
    if (parts.length === 3) {
      const match = findByPath(...parts);
      if (match) {
        selectedFilter = match.filter.id;
        renderFilters();
        showDetail({ filter: match.filter, entity: match.entity }, false);
      }
    }
  }

  elements.searchInput.addEventListener("input", searchAcrossTopics);
  elements.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    searchAcrossTopics();
  });
  elements.searchForm.addEventListener("reset", () => setTimeout(() => {
    query = "";
    selectedTopic = null;
    selectedEntity = null;
    elements.browser.hidden = true;
    elements.detail.hidden = true;
    renderTopics();
    history.pushState(null, "", window.location.pathname + window.location.search);
  }));
  elements.overview.addEventListener("click", () => {
    selectedTopic = null;
    selectedEntity = null;
    elements.browser.hidden = true;
    renderTopics();
    history.pushState(null, "", window.location.pathname + window.location.search);
    elements.topics.querySelector("button")?.focus();
  });
  window.addEventListener("popstate", () => {
    selectedTopic = null;
    selectedEntity = null;
    elements.browser.hidden = true;
    restoreHash();
  });

  fetch(root.dataset.source, { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Die Informationen konnten nicht geladen werden (${response.status}).`);
      return response.json();
    })
    .then((data) => {
      if (!Array.isArray(data.topics) || !data.topics.length) throw new Error("Die Informationsstruktur ist leer.");
      topics = data.topics;
      elements.message.hidden = true;
      renderTopics();
      restoreHash();
    })
    .catch((error) => {
      elements.message.textContent = error.message;
    });
})();
