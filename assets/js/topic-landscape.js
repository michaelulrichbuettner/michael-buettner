(function () {
  const root = document.querySelector("[data-topic-landscape]");
  if (!root) return;

  const svg = root.querySelector("[data-topic-svg]");
  const status = root.querySelector("[data-topic-status]");
  const backButton = root.querySelector("[data-topic-back]");
  const detail = root.querySelector("[data-topic-detail]");
  const stage = root.querySelector(".topic-landscape__stage");
  const fallback = root.querySelector("[data-topic-fallback]");
  const svgNamespace = "http://www.w3.org/2000/svg";

  let data = null;
  let selectedTopicId = null;
  let selectedArticleNode = null;
  let compact = false;

  function svgElement(tagName, attributes = {}) {
    const element = document.createElementNS(svgNamespace, tagName);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
    return element;
  }

  function layoutForMode() {
    return compact
      ? { width: 500, height: 900, centerX: 250, centerY: 450, radiusX: 165, radiusY: 350, minTopicRadius: 56, maxTopicRadius: 70 }
      : { width: 1000, height: 660, centerX: 500, centerY: 330, radiusX: 350, radiusY: 245, minTopicRadius: 64, maxTopicRadius: 84 };
  }

  function wrapLabel(label, maximumCharacters = 19) {
    const words = label.split(" ");
    const lines = [];
    let line = "";

    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (candidate.length > maximumCharacters && line) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function appendMultilineText(group, label, x, y, className, maximumCharacters) {
    const lines = wrapLabel(label, maximumCharacters);
    const text = svgElement("text", { x, y, class: className, "text-anchor": "middle" });
    const lineHeight = compact ? 20 : 19;
    const startOffset = -((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      const span = svgElement("tspan", { x, dy: index === 0 ? startOffset : lineHeight });
      span.textContent = line;
      text.append(span);
    });
    group.append(text);
    return { text, lines, lineHeight };
  }

  function topicRadius(articleCount, maximumCount, layout) {
    const relative = Math.sqrt(articleCount / maximumCount);
    return layout.minTopicRadius + (layout.maxTopicRadius - layout.minTopicRadius) * relative;
  }

  function activateWithKeyboard(element, handler) {
    element.addEventListener("click", handler);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handler();
      }
    });
  }

  function createTopicNode(cluster, x, y, radius, isCenter = false) {
    const group = svgElement("g", {
      class: `topic-node${isCenter ? " topic-node--selected" : ""}`,
      transform: `translate(${x} ${y})`,
      tabindex: "0",
      role: "button",
      "aria-label": `${cluster.name}: ${cluster.articles.length} Artikel öffnen`
    });
    group.append(svgElement("circle", { r: radius }));
    const label = appendMultilineText(group, cluster.shortName, 0, -4, "topic-node__label", compact ? 17 : 19);
    const count = svgElement("text", {
      x: 0,
      y: label.lines.length * label.lineHeight * 0.5 + 18,
      class: "topic-node__count",
      "text-anchor": "middle"
    });
    count.textContent = `${cluster.articles.length} Artikel`;
    group.append(count);
    activateWithKeyboard(group, () => selectTopic(cluster.id));
    return group;
  }

  function createCenterNode(center, layout) {
    const group = svgElement("g", {
      class: "topic-center-node",
      transform: `translate(${layout.centerX} ${layout.centerY})`,
      role: "img",
      "aria-label": `${center.name}, ${center.label}`
    });
    group.append(svgElement("circle", { r: compact ? 67 : 72 }));
    const name = svgElement("text", { x: 0, y: -13, class: "topic-center-node__name", "text-anchor": "middle" });
    name.textContent = center.name;
    group.append(name);
    appendMultilineText(group, compact ? "Journalist · Stratege" : center.label, 0, 16, "topic-center-node__label", compact ? 17 : 21);
    return group;
  }

  function renderOverview() {
    const layout = layoutForMode();
    const maximumCount = Math.max(...data.clusters.map((cluster) => cluster.articles.length));
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.replaceChildren();

    const links = svgElement("g", { class: "topic-landscape__links", "aria-hidden": "true" });
    const nodes = svgElement("g", { class: "topic-landscape__nodes" });

    data.clusters.forEach((cluster, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / data.clusters.length;
      const x = layout.centerX + Math.cos(angle) * layout.radiusX;
      const y = layout.centerY + Math.sin(angle) * layout.radiusY;
      links.append(svgElement("line", { x1: layout.centerX, y1: layout.centerY, x2: x, y2: y }));
      nodes.append(createTopicNode(cluster, x, y, topicRadius(cluster.articles.length, maximumCount, layout)));
    });

    svg.append(links, createCenterNode(data.center, layout), nodes);
    status.textContent = "Themenfeld auswählen, um die zugehörigen Artikelpunkte zu öffnen.";
    backButton.hidden = true;
    clearArticleDetail();
  }

  function articlePositions(count, layout) {
    if (count === 1) {
      return [{ x: layout.centerX, y: layout.centerY - (compact ? 180 : 205), ring: compact ? 180 : 205 }];
    }

    const positions = [];
    const rings = count <= 10
      ? [{ count, radius: compact ? 185 : 215 }]
      : [
          { count: Math.min(8, Math.ceil(count * 0.4)), radius: compact ? 125 : 145 },
          { count: count - Math.min(8, Math.ceil(count * 0.4)), radius: compact ? 220 : 250 }
        ];
    let articleIndex = 0;

    rings.forEach((ring, ringIndex) => {
      for (let index = 0; index < ring.count; index += 1) {
        const offset = ringIndex === 0 ? -Math.PI / 2 : -Math.PI / 2 + Math.PI / ring.count;
        const angle = offset + (index * Math.PI * 2) / ring.count;
        positions[articleIndex] = {
          x: layout.centerX + Math.cos(angle) * ring.radius,
          y: layout.centerY + Math.sin(angle) * ring.radius,
          ring: ring.radius
        };
        articleIndex += 1;
      }
    });
    return positions;
  }

  function clearArticleDetail() {
    if (selectedArticleNode) {
      selectedArticleNode.classList.remove("article-node--selected");
      selectedArticleNode.setAttribute("aria-pressed", "false");
    }
    selectedArticleNode = null;
    stage.classList.remove("topic-landscape__stage--detail-open");
    detail.hidden = true;
    detail.replaceChildren();
  }

  function renderArticleDetail(article, cluster, articleNode) {
    if (selectedArticleNode && selectedArticleNode !== articleNode) {
      selectedArticleNode.classList.remove("article-node--selected");
      selectedArticleNode.setAttribute("aria-pressed", "false");
    }
    selectedArticleNode = articleNode;
    selectedArticleNode.classList.add("article-node--selected");
    selectedArticleNode.setAttribute("aria-pressed", "true");

    const eyebrow = document.createElement("p");
    eyebrow.className = "topic-detail__eyebrow";
    eyebrow.textContent = cluster.name;

    const closeButton = document.createElement("button");
    closeButton.className = "topic-detail__close";
    closeButton.type = "button";
    closeButton.textContent = "Schließen";
    closeButton.setAttribute("aria-label", "Artikeldetails schließen");

    const detailHeader = document.createElement("div");
    detailHeader.className = "topic-detail__header";
    detailHeader.append(eyebrow, closeButton);

    const title = document.createElement("h3");
    title.textContent = article.title;

    const summary = document.createElement("p");
    summary.className = "topic-detail__summary";
    summary.textContent = article.summary;

    const meta = document.createElement("div");
    meta.className = "topic-detail__meta";
    if (article.eventBased) {
      const event = document.createElement("span");
      event.className = "topic-detail__event";
      event.setAttribute("aria-label", "Eventbeitrag");
      event.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>';
      const eventText = [article.eventName, article.location].filter(Boolean).join(" · ");
      event.append(document.createTextNode(eventText));
      meta.append(event);
    }

    const link = document.createElement("a");
    link.className = "button button--secondary topic-detail__link";
    link.href = article.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = `${article.title} bei inside digital öffnen`;
    link.textContent = "Originalartikel öffnen";
    meta.append(link);

    detail.replaceChildren(detailHeader, title, summary, meta);
    detail.hidden = false;
    stage.classList.add("topic-landscape__stage--detail-open");

    closeButton.addEventListener("click", () => {
      const nodeToFocus = selectedArticleNode;
      clearArticleDetail();
      nodeToFocus?.focus();
    });
  }

  function createArticleNode(article, cluster, position, index) {
    const group = svgElement("g", {
      class: `article-node${article.eventBased ? " article-node--event" : ""}`,
      transform: `translate(${position.x} ${position.y})`,
      tabindex: "0",
      role: "button",
      "aria-pressed": "false",
      "aria-label": `Artikel ${index + 1}: ${article.title}`
    });
    group.append(svgElement("circle", { r: compact ? 12 : 13 }));
    const number = svgElement("text", { x: 0, y: 4, "text-anchor": "middle", "aria-hidden": "true" });
    number.textContent = index + 1;
    group.append(number);

    const showDetail = () => renderArticleDetail(article, cluster, group);
    activateWithKeyboard(group, showDetail);
    return group;
  }

  function renderSelectedTopic(cluster) {
    const layout = layoutForMode();
    const positions = articlePositions(cluster.articles.length, layout);
    svg.setAttribute("viewBox", `0 0 ${layout.width} ${layout.height}`);
    svg.replaceChildren();

    const orbits = svgElement("g", { class: "topic-landscape__orbits", "aria-hidden": "true" });
    [...new Set(positions.map((position) => position.ring))].forEach((radius) => {
      orbits.append(svgElement("circle", { cx: layout.centerX, cy: layout.centerY, r: radius }));
    });

    const articleNodes = svgElement("g", { class: "article-nodes" });
    cluster.articles.forEach((article, index) => {
      articleNodes.append(createArticleNode(article, cluster, positions[index], index));
    });

    svg.append(orbits, createTopicNode(cluster, layout.centerX, layout.centerY, compact ? 72 : 82, true), articleNodes);
    status.textContent = `${cluster.articles.length} Artikel in „${cluster.name}“. Artikelpunkt auswählen oder das Themenfeld erneut anklicken.`;
    backButton.hidden = false;
    clearArticleDetail();
  }

  function selectTopic(topicId) {
    if (selectedTopicId === topicId) {
      selectedTopicId = null;
      renderOverview();
      return;
    }
    selectedTopicId = topicId;
    const cluster = data.clusters.find((item) => item.id === topicId);
    if (cluster) renderSelectedTopic(cluster);
  }

  function render() {
    if (!data) return;
    const cluster = data.clusters.find((item) => item.id === selectedTopicId);
    if (cluster) renderSelectedTopic(cluster);
    else renderOverview();
  }

  async function initialize() {
    const response = await fetch(root.dataset.source, { cache: "no-store" });
    if (!response.ok) throw new Error(`Die Artikeldaten konnten nicht geladen werden (${response.status}).`);
    data = await response.json();
    if (!Array.isArray(data.clusters) || data.clusters.length !== 8) {
      throw new Error("Die Themenstruktur ist unvollständig.");
    }

    compact = root.clientWidth < 640;
    render();

    const resizeObserver = new ResizeObserver((entries) => {
      const nextCompact = entries[0].contentRect.width < 640;
      if (nextCompact !== compact) {
        compact = nextCompact;
        render();
      }
    });
    resizeObserver.observe(root);
  }

  backButton.addEventListener("click", () => {
    selectedTopicId = null;
    renderOverview();
  });

  initialize().catch((error) => {
    root.querySelector(".topic-landscape__stage").hidden = true;
    root.querySelector(".topic-landscape__toolbar").hidden = true;
    fallback.hidden = false;
    fallback.textContent = error.message;
  });
})();
