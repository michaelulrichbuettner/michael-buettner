(function () {
  const root = document.querySelector("[data-article-timeline]");
  if (!root) return;

  const stage = root.querySelector("[data-timeline-stage]");
  const canvas = root.querySelector("[data-timeline-canvas]");
  const context = canvas.getContext("2d");
  const status = root.querySelector("[data-timeline-status]");
  const detail = root.querySelector("[data-timeline-detail]");
  const fallback = root.querySelector("[data-timeline-fallback]");
  const filterButtons = [...root.querySelectorAll("[data-format-filter]")];
  const zoomInButton = root.querySelector("[data-timeline-zoom-in]");
  const zoomOutButton = root.querySelector("[data-timeline-zoom-out]");
  const resetButton = root.querySelector("[data-timeline-reset]");

  const DAY = 24 * 60 * 60 * 1000;
  const MIN_SPAN = 7 * DAY;
  const NUMBER_FORMAT = new Intl.NumberFormat("de-DE");
  const MONTH_FORMAT = new Intl.DateTimeFormat("de-DE", { month: "short", year: "numeric", timeZone: "UTC" });
  const DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const SHORT_DATE_FORMAT = new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short", timeZone: "UTC" });

  let data = null;
  let articles = [];
  let topics = [];
  let topicById = new Map();
  let fullStart = 0;
  let fullEnd = 0;
  let viewStart = 0;
  let viewEnd = 0;
  let activeFormat = "all";
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let layout = null;
  let hitTargets = [];
  let selectedId = null;
  let detailPinned = false;
  let hoveredTarget = null;
  let pointerState = null;
  let renderFrame = 0;

  const formatMeta = {
    news: { label: "News", lane: -0.23, shape: "circle", color: "#9c7a16" },
    test: { label: "Test", lane: 0, shape: "diamond", color: "#70a8d8" },
    guide: { label: "Ratgeber", lane: 0.23, shape: "triangle", color: "#7cc783" }
  };

  const palette = {
    ink: "#171717",
    muted: "#666666",
    line: "#dedede",
    lineSoft: "#eeeeee",
    soft: "#f4f4f2",
    white: "#ffffff",
    yellowSoft: "#fff2c7",
    yellow: "#f1d46b"
  };

  function cssValue(name, fallbackValue) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallbackValue;
  }

  function readTheme() {
    palette.ink = cssValue("--color-ink", palette.ink);
    palette.muted = cssValue("--color-muted", palette.muted);
    palette.line = cssValue("--color-line", palette.line);
    palette.lineSoft = cssValue("--color-line-soft", palette.lineSoft);
    palette.soft = cssValue("--color-soft", palette.soft);
    palette.white = cssValue("--color-white", palette.white);
    palette.yellowSoft = cssValue("--color-yellow-soft", palette.yellowSoft);
    palette.yellow = cssValue("--color-yellow", palette.yellow);
    formatMeta.news.color = cssValue("--color-yellow-dark", formatMeta.news.color);
    formatMeta.test.color = cssValue("--color-swot-blue", formatMeta.test.color);
    formatMeta.guide.color = cssValue("--color-swot-green", formatMeta.guide.color);
  }

  function parseDate(value) {
    return Date.parse(`${value}T00:00:00Z`);
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function rgba(hex, alpha) {
    const value = hex.replace("#", "");
    if (value.length !== 6) return hex;
    const red = Number.parseInt(value.slice(0, 2), 16);
    const green = Number.parseInt(value.slice(2, 4), 16);
    const blue = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  function hashUnit(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967295;
  }

  function xForTime(time) {
    return layout.left + ((time - viewStart) / (viewEnd - viewStart)) * layout.plotWidth;
  }

  function timeForX(x) {
    const ratio = clamp((x - layout.left) / layout.plotWidth, 0, 1);
    return viewStart + ratio * (viewEnd - viewStart);
  }

  function rowCenter(topicId) {
    return rowForTopic(topicId, layout.left + layout.plotWidth / 2).center;
  }

  function rowForTopic(topicId, x) {
    const samples = layout.bandSamples || [];
    if (!samples.length) {
      return { top: layout.top, height: layout.minimumRowHeight, center: layout.top };
    }
    const samplePosition = clamp((x - layout.left) / layout.plotWidth, 0, 1) * (samples.length - 1);
    const before = samples[Math.floor(samplePosition)];
    const after = samples[Math.min(samples.length - 1, Math.ceil(samplePosition))];
    const progress = samplePosition - Math.floor(samplePosition);
    const first = before.rows.get(topicId);
    const second = after.rows.get(topicId);
    if (!first || !second) return { top: layout.top, height: layout.minimumRowHeight, center: layout.top };
    const top = first.top + (second.top - first.top) * progress;
    const heightForRow = first.height + (second.height - first.height) * progress;
    return { top, height: heightForRow, center: top + heightForRow / 2 };
  }

  function formatDateRange(start, end) {
    const span = end - start;
    if (span > 370 * DAY) return `${MONTH_FORMAT.format(start)} – ${MONTH_FORMAT.format(end)}`;
    return `${DATE_FORMAT.format(start)} – ${DATE_FORMAT.format(end)}`;
  }

  function setDomain(nextStart, nextEnd) {
    const fullSpan = fullEnd - fullStart;
    let span = clamp(nextEnd - nextStart, MIN_SPAN, fullSpan);
    let start = nextStart;

    if (start < fullStart) start = fullStart;
    if (start + span > fullEnd) start = fullEnd - span;

    viewStart = start;
    viewEnd = start + span;
    scheduleRender();
  }

  function zoomAt(x, factor) {
    const oldSpan = viewEnd - viewStart;
    const fullSpan = fullEnd - fullStart;
    const newSpan = clamp(oldSpan * factor, MIN_SPAN, fullSpan);
    const ratio = clamp((x - layout.left) / layout.plotWidth, 0, 1);
    const anchor = viewStart + oldSpan * ratio;
    setDomain(anchor - newSpan * ratio, anchor + newSpan * (1 - ratio));
  }

  function panByPixels(deltaX) {
    const shift = (deltaX / layout.plotWidth) * (viewEnd - viewStart);
    setDomain(viewStart + shift, viewEnd + shift);
  }

  function resetView() {
    viewStart = fullStart;
    viewEnd = fullEnd;
    selectedId = null;
    detailPinned = false;
    hideDetail();
    scheduleRender();
  }

  function font(size, weight = 400, family = "body") {
    const fontFamily = cssValue(family === "heading" ? "--font-heading" : "--font-body", family === "heading" ? "Georgia, serif" : "sans-serif");
    return `${weight} ${size}px ${fontFamily}`;
  }

  function wrapText(text, maximumWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maximumWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function tickSpecification() {
    const days = (viewEnd - viewStart) / DAY;
    const targetCount = Math.max(2, Math.floor(layout.plotWidth / (layout.compact ? 68 : 78)));
    const candidates = [
      { unit: "day", step: 1, estimate: days },
      { unit: "day", step: 2, estimate: days / 2 },
      { unit: "day", step: 7, estimate: days / 7 },
      { unit: "day", step: 14, estimate: days / 14 },
      { unit: "month", step: 1, estimate: days / 30.44 },
      { unit: "month", step: 2, estimate: days / 60.88 },
      { unit: "month", step: 3, estimate: days / 91.31 },
      { unit: "month", step: 6, estimate: days / 182.62 },
      { unit: "year", step: 1, estimate: days / 365.25 },
      { unit: "year", step: 2, estimate: days / 730.5 },
      { unit: "year", step: 5, estimate: days / 1826.25 }
    ];
    return candidates.find((candidate) => candidate.estimate <= targetCount) || candidates[candidates.length - 1];
  }

  function timeTicks() {
    const specification = tickSpecification();
    const ticks = [];
    const start = new Date(viewStart);
    let cursor;

    if (specification.unit === "year") {
      const year = Math.floor(start.getUTCFullYear() / specification.step) * specification.step;
      cursor = new Date(Date.UTC(year, 0, 1));
    } else if (specification.unit === "month") {
      const monthIndex = start.getUTCFullYear() * 12 + start.getUTCMonth();
      const aligned = Math.floor(monthIndex / specification.step) * specification.step;
      cursor = new Date(Date.UTC(Math.floor(aligned / 12), aligned % 12, 1));
    } else {
      cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
      if (specification.step === 7 || specification.step === 14) {
        const weekday = (cursor.getUTCDay() + 6) % 7;
        cursor.setUTCDate(cursor.getUTCDate() - weekday);
      }
    }

    while (cursor.getTime() < viewStart) {
      if (specification.unit === "year") cursor.setUTCFullYear(cursor.getUTCFullYear() + specification.step);
      else if (specification.unit === "month") cursor.setUTCMonth(cursor.getUTCMonth() + specification.step);
      else cursor.setUTCDate(cursor.getUTCDate() + specification.step);
    }

    while (cursor.getTime() <= viewEnd) {
      const time = cursor.getTime();
      let label;
      if (specification.unit === "year") label = String(cursor.getUTCFullYear());
      else if (specification.unit === "month") label = MONTH_FORMAT.format(time);
      else label = SHORT_DATE_FORMAT.format(time);
      ticks.push({ time, label });

      if (specification.unit === "year") cursor.setUTCFullYear(cursor.getUTCFullYear() + specification.step);
      else if (specification.unit === "month") cursor.setUTCMonth(cursor.getUTCMonth() + specification.step);
      else cursor.setUTCDate(cursor.getUTCDate() + specification.step);
    }
    return ticks;
  }

  function drawStructure() {
    context.clearRect(0, 0, width, height);
    context.fillStyle = palette.white;
    context.fillRect(0, 0, width, height);

    topics.forEach((topic, index) => {
      const firstRow = layout.bandSamples[0].rows.get(topic.id);
      if (index % 2 === 1) {
        context.fillStyle = rgba(palette.soft, 0.56);
        context.beginPath();
        layout.bandSamples.forEach((sample, sampleIndex) => {
          const row = sample.rows.get(topic.id);
          if (sampleIndex === 0) context.moveTo(sample.x, row.top);
          else context.lineTo(sample.x, row.top);
        });
        [...layout.bandSamples].reverse().forEach((sample) => {
          const row = sample.rows.get(topic.id);
          context.lineTo(sample.x, row.top + row.height);
        });
        context.closePath();
        context.fill();
      }
      context.strokeStyle = palette.lineSoft;
      context.lineWidth = 1;
      context.beginPath();
      layout.bandSamples.forEach((sample, sampleIndex) => {
        const row = sample.rows.get(topic.id);
        if (sampleIndex === 0) context.moveTo(sample.x, row.top + row.height);
        else context.lineTo(sample.x, row.top + row.height);
      });
      context.stroke();

      context.save();
      context.fillStyle = palette.ink;
      context.font = font(layout.compact ? 11 : 13, 600);
      context.textAlign = "left";
      context.textBaseline = "middle";
      const labelWidth = layout.left - (layout.compact ? 20 : 32);
      const lines = wrapText(topic.name, labelWidth);
      const lineHeight = layout.compact ? 14 : 17;
      const startY = firstRow.center - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((line, lineIndex) => {
        context.fillText(line, layout.compact ? 10 : 16, startY + lineIndex * lineHeight);
      });
      context.restore();
    });

    context.strokeStyle = palette.line;
    context.beginPath();
    context.moveTo(layout.left, layout.top - 2);
    context.lineTo(layout.left, height - layout.bottom);
    context.stroke();

    const ticks = timeTicks();
    context.font = font(layout.compact ? 10 : 11, 500);
    context.textBaseline = "bottom";
    ticks.forEach((tick, index) => {
      const x = xForTime(tick.time);
      context.strokeStyle = palette.lineSoft;
      context.beginPath();
      context.moveTo(x, layout.top - 2);
      context.lineTo(x, height - layout.bottom);
      context.stroke();

      context.fillStyle = palette.muted;
      const labelWidth = context.measureText(tick.label).width;
      let labelX = x;
      let alignment = "center";
      if (index === 0 && x - labelWidth / 2 < layout.left) {
        labelX = layout.left + 3;
        alignment = "left";
      } else if (x + labelWidth / 2 > width - layout.right) {
        labelX = width - layout.right - 3;
        alignment = "right";
      }
      context.textAlign = alignment;
      context.fillText(tick.label, labelX, layout.top - 10);
    });
  }

  function drawMark(x, y, format, alpha = 1, selected = false) {
    const meta = formatMeta[format] || formatMeta.news;
    const radius = selected ? 7.5 : 5.5;
    context.save();
    context.globalAlpha = alpha;
    context.fillStyle = meta.color;
    context.strokeStyle = selected ? palette.ink : palette.white;
    context.lineWidth = selected ? 2.5 : 1.4;
    context.beginPath();
    if (meta.shape === "diamond") {
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y);
      context.lineTo(x, y + radius);
      context.lineTo(x - radius, y);
      context.closePath();
    } else if (meta.shape === "triangle") {
      context.moveTo(x, y - radius);
      context.lineTo(x + radius * 0.92, y + radius * 0.78);
      context.lineTo(x - radius * 0.92, y + radius * 0.78);
      context.closePath();
    } else {
      context.arc(x, y, radius, 0, Math.PI * 2);
    }
    context.fill();
    context.stroke();
    context.restore();
  }

  function drawArticleRun(run, topic, format) {
    if (!run.length) return;
    run.forEach((item, localIndex) => {
      // Preserve every article as an individual mark. Nearby releases use a
      // gentle, deterministic vertical fan so that identical dates remain
      // discoverable without breaking the calm character of the timeline.
      const progress = run.length > 1 ? localIndex / (run.length - 1) - 0.5 : 0;
      const stackOffset = progress * Math.min(12, item.rowHeight * 0.16);
      const jitter = (hashUnit(`${item.article.id}-fan`) - 0.5) * Math.min(3, item.rowHeight * 0.05);
      const y = clamp(item.y + stackOffset + jitter, item.rowTop + 7, item.rowBottom - 7);
      const selected = selectedId === item.article.id;
      drawMark(item.x, y, format, 1, selected);
      hitTargets.push({ kind: "article", article: item.article, topic, x: item.x, y, radius: layout.coarse ? 22 : 15 });
    });
  }

  function drawData(visibleArticles) {
    const grouped = new Map();
    visibleArticles.forEach((article) => {
      const key = `${article.topic}|${article.format}`;
      if (!grouped.has(key)) grouped.set(key, []);
      const x = xForTime(article.time);
      const row = rowForTopic(article.topic, x);
      const inset = Math.min(14, Math.max(7, row.height * 0.12));
      const availableHeight = Math.max(0, row.height - inset * 2);
      // Vertical placement has no extra semantic meaning. It simply uses the
      // local band room so individual marks stay legible in dense phases.
      const y = row.top + inset + hashUnit(article.id) * availableHeight;
      grouped.get(key).push({ article, x, y, rowHeight: row.height, rowTop: row.top, rowBottom: row.top + row.height });
    });

    grouped.forEach((items, key) => {
      const [topicId, format] = key.split("|");
      const topic = topicById.get(topicId);
      if (!topic) return;
      items.sort((left, right) => left.x - right.x);
      let run = [items[0]];

      for (let index = 1; index < items.length; index += 1) {
        if (items[index].x - items[index - 1].x <= layout.clusterDistance) {
          run.push(items[index]);
        } else {
          drawArticleRun(run, topic, format);
          run = [items[index]];
        }
      }
      drawArticleRun(run, topic, format);
    });
  }

  function visibleArticles() {
    return articles.filter((article) => {
      const matchesFormat = activeFormat === "all" || article.format === activeFormat;
      return matchesFormat && article.time >= viewStart && article.time <= viewEnd;
    });
  }

  function buildBandGeometry() {
    const sampleStep = layout.compact ? 6 : 8;
    const sampleCount = Math.max(42, Math.ceil(layout.plotWidth / sampleStep) + 1);
    const kernelPixels = clamp(layout.compact ? 44 : 58, 34, layout.plotWidth * 0.11);
    const kernelDuration = (viewEnd - viewStart) * (kernelPixels / layout.plotWidth);
    const continuityDuration = kernelDuration * 8;
    const contextDuration = continuityDuration * 3;
    const matchingArticles = articles.filter((article) => {
      const matchesFormat = activeFormat === "all" || article.format === activeFormat;
      return matchesFormat;
    });
    const byTopic = new Map(topics.map((topic) => [topic.id, []]));
    const topicTotals = new Map(topics.map((topic) => [topic.id, 0]));
    matchingArticles.forEach((article) => {
      topicTotals.set(article.topic, topicTotals.get(article.topic) + 1);
      if (article.time >= viewStart - contextDuration && article.time <= viewEnd + contextDuration) {
        byTopic.get(article.topic)?.push(article);
      }
    });

    const samples = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const ratio = index / (sampleCount - 1);
      const x = layout.left + ratio * layout.plotWidth;
      const time = viewStart + ratio * (viewEnd - viewStart);
      const rawWeights = topics.map((topic) => {
        const densities = byTopic.get(topic.id).reduce((sum, article) => {
          const localDistance = (article.time - time) / kernelDuration;
          const trendDistance = (article.time - time) / continuityDuration;
          if (Math.abs(trendDistance) > 3) return sum;
          sum.local += Math.abs(localDistance) > 3 ? 0 : Math.exp(-0.5 * localDistance * localDistance);
          sum.trend += Math.exp(-0.5 * trendDistance * trendDistance);
          return sum;
        }, { local: 0, trend: 0 });
        const globalPrior = Math.log1p(topicTotals.get(topic.id) || 0) * 0.025;
        return Math.log1p(densities.local) + Math.log1p(densities.trend) * 0.18 + globalPrior;
      });
      const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
      const fallbackWeight = totalWeight ? 0 : 1 / topics.length;
      let currentTop = layout.top;
      const rows = new Map();
      topics.forEach((topic, topicIndex) => {
        const share = totalWeight ? rawWeights[topicIndex] / totalWeight : fallbackWeight;
        const heightForRow = layout.minimumRowHeight + layout.flexibleHeight * share;
        rows.set(topic.id, { top: currentTop, height: heightForRow, center: currentTop + heightForRow / 2 });
        currentTop += heightForRow;
      });
      samples.push({ x, rows });
    }
    layout.bandSamples = samples;
  }

  function updateStatus(currentArticles) {
    const formatLabel = activeFormat === "all" ? "Alle Formate" : formatMeta[activeFormat].label;
    const exactVisible = currentArticles.filter((article) => article.time >= viewStart && article.time <= viewEnd).length;
    status.textContent = `${formatLabel}: ${NUMBER_FORMAT.format(exactVisible)} Artikel · ${formatDateRange(viewStart, viewEnd)}`;
  }

  function render() {
    renderFrame = 0;
    if (!data || !layout) return;
    hitTargets = [];
    buildBandGeometry();
    drawStructure();
    const currentArticles = visibleArticles();
    context.save();
    context.beginPath();
    context.rect(layout.left, layout.top, layout.plotWidth, layout.plotHeight);
    context.clip();
    drawData(currentArticles);
    context.restore();
    updateStatus(currentArticles);

    if (detailPinned && selectedId) {
      const selectedTarget = hitTargets.find((target) => target.kind === "article" && target.article.id === selectedId);
      if (selectedTarget) positionDetail(selectedTarget);
      else hideDetail();
    }
  }

  function scheduleRender() {
    if (renderFrame) return;
    renderFrame = requestAnimationFrame(render);
  }

  function resizeCanvas() {
    const rectangle = stage.getBoundingClientRect();
    width = Math.max(280, Math.round(rectangle.width));
    height = Math.max(620, Math.round(rectangle.height));
    pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const compact = width < 620;
    const left = compact ? 124 : 214;
    const right = compact ? 10 : 18;
    const top = compact ? 48 : 54;
    const bottom = 18;
    const coarse = matchMedia("(pointer: coarse)").matches;
    const plotHeight = height - top - bottom;
    const minimumRowHeight = Math.min(compact ? 30 : 36, plotHeight / topics.length);
    const flexibleHeight = Math.max(0, plotHeight - minimumRowHeight * topics.length);

    layout = {
      compact,
      coarse,
      left,
      right,
      top,
      bottom,
      plotWidth: Math.max(100, width - left - right),
      plotHeight,
      minimumRowHeight,
      flexibleHeight,
      bandSamples: [],
      clusterDistance: coarse ? 20 : compact ? 17 : 14
    };
    scheduleRender();
  }

  function pointFromEvent(event) {
    const rectangle = stage.getBoundingClientRect();
    return { x: event.clientX - rectangle.left, y: event.clientY - rectangle.top };
  }

  function hitTest(point) {
    if (
      point.x < layout.left || point.x > layout.left + layout.plotWidth ||
      point.y < layout.top || point.y > layout.top + layout.plotHeight
    ) return null;
    let closestArticle = null;
    let closestDistance = Infinity;
    for (const target of hitTargets) {
      if (target.kind !== "article") continue;
      const distance = Math.hypot(point.x - target.x, point.y - target.y);
      if (distance <= target.radius && distance < closestDistance) {
        closestArticle = target;
        closestDistance = distance;
      }
    }
    if (closestArticle) return closestArticle;
    return null;
  }

  function appendTextElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    return element;
  }

  function renderArticleDetail(target, pinned) {
    const article = target.article;
    const topic = target.topic;
    const header = document.createElement("div");
    header.className = "article-timeline__detail-header";
    header.append(appendTextElement("p", "article-timeline__detail-eyebrow", topic.name));

    if (pinned) {
      const close = appendTextElement("button", "article-timeline__detail-close", "Schließen");
      close.type = "button";
      close.setAttribute("aria-label", "Artikeldetails schließen");
      close.addEventListener("click", () => {
        selectedId = null;
        detailPinned = false;
        hideDetail();
        scheduleRender();
        canvas.focus();
      });
      header.append(close);
    }

    const heading = document.createElement("h3");
    if (article.url) {
      const link = document.createElement("a");
      link.href = article.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = article.title;
      link.title = `${article.title} bei inside digital öffnen`;
      heading.append(link);
    } else {
      heading.textContent = article.title;
    }

    const meta = appendTextElement(
      "p",
      "article-timeline__detail-meta",
      `${DATE_FORMAT.format(article.time)} · ${article.formatLabel} · ${topic.name}`
    );
    const children = [header, heading, meta];
    if (!article.url) {
      children.push(appendTextElement("p", "article-timeline__detail-unavailable", "Originalartikel nicht mehr online"));
    }
    if (article.eventName || article.location) {
      const eventText = [article.eventName, article.location].filter(Boolean).join(" · ");
      children.push(appendTextElement("p", "article-timeline__detail-event", `Vor Ort: ${eventText}`));
    }
    detail.replaceChildren(...children);
    detail.hidden = false;
    positionDetail(target);
  }

  function renderDensityDetail(target) {
    const dates = target.articles.map((article) => article.time);
    const start = Math.min(...dates);
    const end = Math.max(...dates);
    const header = document.createElement("div");
    header.className = "article-timeline__detail-header";
    header.append(appendTextElement("p", "article-timeline__detail-eyebrow", target.topic.name));
    const heading = appendTextElement(
      "h3",
      "",
      `${NUMBER_FORMAT.format(target.articles.length)} ${formatMeta[target.format].label}-Artikel`
    );
    const meta = appendTextElement(
      "p",
      "article-timeline__detail-meta",
      `${formatDateRange(start, end)} · Anklicken, um diesen Zeitraum zu öffnen.`
    );
    detail.replaceChildren(header, heading, meta);
    detail.hidden = false;
    positionDetail(target);
  }

  function positionDetail(target) {
    if (detail.hidden) return;
    const inset = 12;
    const detailWidth = detail.offsetWidth;
    const detailHeight = detail.offsetHeight;
    let left = target.x + 16;
    let top = target.y + 16;
    if (left + detailWidth > width - inset) left = target.x - detailWidth - 16;
    if (top + detailHeight > height - inset) top = target.y - detailHeight - 16;
    detail.style.left = `${clamp(left, inset, width - detailWidth - inset)}px`;
    detail.style.top = `${clamp(top, inset, height - detailHeight - inset)}px`;
  }

  function showTargetDetail(target, pinned = false) {
    if (!target) return;
    if (target.kind === "article") renderArticleDetail(target, pinned);
    else renderDensityDetail(target);
  }

  function hideDetail() {
    detail.hidden = true;
    detail.replaceChildren();
    detail.style.removeProperty("left");
    detail.style.removeProperty("top");
  }

  function zoomToDensity(target) {
    const times = target.articles.map((article) => article.time);
    const minimum = Math.min(...times);
    const maximum = Math.max(...times);
    const rawSpan = Math.max(maximum - minimum, 21 * DAY);
    const padding = Math.max(7 * DAY, rawSpan * 0.45);
    selectedId = null;
    detailPinned = false;
    hideDetail();
    setDomain(minimum - padding, maximum + padding);
  }

  stage.addEventListener("wheel", (event) => {
    if (!layout) return;
    event.preventDefault();
    const point = pointFromEvent(event);
    if (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY) * 0.65) {
      panByPixels(event.deltaX);
      return;
    }
    const factor = Math.exp(clamp(event.deltaY, -180, 180) * 0.0024);
    zoomAt(point.x, factor);
  }, { passive: false });

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("[data-timeline-detail]")) return;
    const point = pointFromEvent(event);
    pointerState = { id: event.pointerId, startX: point.x, startY: point.y, lastX: point.x, moved: false };
    stage.setPointerCapture(event.pointerId);
    stage.classList.add("is-dragging");
  });

  stage.addEventListener("pointermove", (event) => {
    if (event.target.closest("[data-timeline-detail]")) return;
    if (pointerState && pointerState.id === event.pointerId) {
      const point = pointFromEvent(event);
      const deltaX = pointerState.lastX - point.x;
      if (Math.abs(point.x - pointerState.startX) > 4 || Math.abs(point.y - pointerState.startY) > 4) pointerState.moved = true;
      pointerState.lastX = point.x;
      if (pointerState.moved) panByPixels(deltaX);
      return;
    }

    if (detailPinned || event.pointerType !== "mouse") return;
    const target = hitTest(pointFromEvent(event));
    if (target === hoveredTarget) return;
    hoveredTarget = target;
    if (target) showTargetDetail(target, false);
    else hideDetail();
  });

  stage.addEventListener("pointerup", (event) => {
    if (!pointerState || pointerState.id !== event.pointerId) return;
    const moved = pointerState.moved;
    pointerState = null;
    stage.classList.remove("is-dragging");
    if (stage.hasPointerCapture(event.pointerId)) stage.releasePointerCapture(event.pointerId);
    if (moved) return;

    const target = hitTest(pointFromEvent(event));
    if (target?.kind === "density") {
      zoomToDensity(target);
    } else if (target?.kind === "article") {
      selectedId = target.article.id;
      detailPinned = true;
      hoveredTarget = target;
      showTargetDetail(target, true);
      scheduleRender();
    } else {
      selectedId = null;
      detailPinned = false;
      hoveredTarget = null;
      hideDetail();
      scheduleRender();
    }
  });

  stage.addEventListener("pointercancel", () => {
    pointerState = null;
    stage.classList.remove("is-dragging");
  });

  stage.addEventListener("pointerleave", () => {
    if (!detailPinned && !pointerState) {
      hoveredTarget = null;
      hideDetail();
    }
  });

  detail.addEventListener("pointerdown", (event) => event.stopPropagation());
  detail.addEventListener("pointerup", (event) => event.stopPropagation());

  canvas.addEventListener("keydown", (event) => {
    if (!layout) return;
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAt(layout.left + layout.plotWidth / 2, 0.62);
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomAt(layout.left + layout.plotWidth / 2, 1.6);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      panByPixels(-layout.plotWidth * 0.12);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      panByPixels(layout.plotWidth * 0.12);
    } else if (event.key === "Home") {
      event.preventDefault();
      resetView();
    } else if (event.key === "Escape") {
      selectedId = null;
      detailPinned = false;
      hideDetail();
      scheduleRender();
    }
  });

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeFormat = button.dataset.formatFilter;
      filterButtons.forEach((candidate) => candidate.setAttribute("aria-pressed", String(candidate === button)));
      selectedId = null;
      detailPinned = false;
      hideDetail();
      scheduleRender();
    });
  });

  zoomInButton.addEventListener("click", () => zoomAt(layout.left + layout.plotWidth / 2, 0.55));
  zoomOutButton.addEventListener("click", () => zoomAt(layout.left + layout.plotWidth / 2, 1.8));
  resetButton.addEventListener("click", resetView);

  async function initialize() {
    readTheme();
    if (window.__ARTICLE_ARCHIVE_DATA__) {
      data = window.__ARTICLE_ARCHIVE_DATA__;
    } else {
      const response = await fetch(root.dataset.source, { cache: "no-store" });
      if (!response.ok) throw new Error(`Die Artikeldaten konnten nicht geladen werden (${response.status}).`);
      data = await response.json();
    }
    if (!Array.isArray(data.articles) || !Array.isArray(data.topics) || !data.articles.length || !data.topics.length) {
      throw new Error("Die Daten für das Artikelarchiv sind unvollständig.");
    }

    topics = data.topics;
    topicById = new Map(topics.map((topic) => [topic.id, topic]));
    articles = data.articles
      .map((article) => ({ ...article, time: parseDate(article.date) }))
      .filter((article) => Number.isFinite(article.time))
      .sort((left, right) => left.time - right.time);

    fullStart = articles[0].time - 5 * DAY;
    fullEnd = articles[articles.length - 1].time + 5 * DAY;
    viewStart = fullStart;
    viewEnd = fullEnd;

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(stage);
    resizeCanvas();
  }

  initialize().catch((error) => {
    stage.hidden = true;
    root.querySelector(".article-timeline__toolbar").hidden = true;
    root.querySelector(".article-timeline__meta").hidden = true;
    root.querySelector(".article-timeline__instructions").hidden = true;
    fallback.hidden = false;
    fallback.textContent = error.message;
  });
})();
