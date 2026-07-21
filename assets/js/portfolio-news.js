(function () {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const DATE_PATTERN = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
  const URL_PATTERN = /^https?:\/\/\S+$/i;
  const germanDateTime = new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  function berlinTodayValue() {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day));
  }

  function parseNews(value) {
    if (typeof value !== "string" || !value.trim()) return null;

    const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const dateMatch = lines[0] && lines[0].match(DATE_PATTERN);
    if (!dateMatch || !lines[1]) return null;

    const dateValue = Date.UTC(Number(dateMatch[3]), Number(dateMatch[2]) - 1, Number(dateMatch[1]));
    const urls = [];
    const summaryLines = [];

    lines.slice(2).forEach((line) => {
      if (URL_PATTERN.test(line)) urls.push(line);
      else summaryLines.push(line);
    });

    return {
      dateLabel: lines[0],
      dateValue,
      title: lines[1],
      summary: summaryLines.join(" "),
      urls
    };
  }

  function normalizeCompanies(records) {
    return records.map((record) => {
      const news = [record.News_1, record.News_2, record.News_3]
        .map(parseNews)
        .filter(Boolean)
        .sort((a, b) => b.dateValue - a.dateValue);

      return {
        id: String(record.id || record.Name || ""),
        name: String(record.Name || "Unbenanntes Unternehmen"),
        news,
        newestDate: news[0] ? news[0].dateValue : Number.NEGATIVE_INFINITY
      };
    });
  }

  function ageClass(dateValue) {
    const age = Math.round((berlinTodayValue() - dateValue) / DAY_MS);
    if (age === 0) return "is-today";
    if (age >= 1 && age <= 5) return "is-recent";
    return "is-older";
  }

  function createPreview(news) {
    const cell = document.createElement("span");
    cell.className = "portfolio-news__cell";

    if (!news) {
      cell.classList.add("is-placeholder");
      cell.textContent = "Keine weitere Meldung";
      return cell;
    }

    cell.classList.add(ageClass(news.dateValue));
    const date = document.createElement("time");
    date.dateTime = new Date(news.dateValue).toISOString().slice(0, 10);
    date.textContent = news.dateLabel;
    const title = document.createElement("strong");
    title.textContent = news.title;
    cell.append(date, title);
    return cell;
  }

  function safeLink(url, index) {
    const link = document.createElement("a");
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = index === 0 ? "Quelle öffnen" : `Weitere Quelle ${index + 1}`;

    try {
      const parsed = new URL(url);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error("Unsupported protocol");
      link.href = parsed.href;
    } catch (error) {
      link.removeAttribute("href");
      link.textContent = "Quelle nicht verfügbar";
    }
    return link;
  }

  function createDetail(news) {
    const detail = document.createElement("article");
    detail.className = "portfolio-news__detail";

    if (!news) {
      detail.classList.add("is-placeholder");
      detail.textContent = "Für dieses Unternehmen liegt hier keine weitere Meldung vor.";
      return detail;
    }

    detail.classList.add(ageClass(news.dateValue));
    const date = document.createElement("time");
    date.dateTime = new Date(news.dateValue).toISOString().slice(0, 10);
    date.textContent = news.dateLabel;
    const heading = document.createElement("h3");
    heading.textContent = news.title;
    const summary = document.createElement("p");
    summary.textContent = news.summary || "Zu dieser Meldung ist keine weitere Zusammenfassung vorhanden.";
    detail.append(date, heading, summary);

    if (news.urls.length) {
      const links = document.createElement("div");
      links.className = "portfolio-news__links";
      news.urls.forEach((url, index) => links.append(safeLink(url, index)));
      detail.append(links);
    }
    return detail;
  }

  function createCompanyRow(company) {
    const details = document.createElement("details");
    details.className = "portfolio-news__company";

    const summary = document.createElement("summary");
    summary.className = "portfolio-news__company-summary";
    const name = document.createElement("span");
    name.className = "portfolio-news__company-name";
    name.textContent = company.name;
    summary.append(name);
    for (let index = 0; index < 3; index += 1) summary.append(createPreview(company.news[index]));

    const expanded = document.createElement("div");
    expanded.className = "portfolio-news__expanded";
    const hint = document.createElement("span");
    hint.className = "portfolio-news__expanded-label";
    hint.textContent = "Details";
    expanded.append(hint);
    for (let index = 0; index < 3; index += 1) expanded.append(createDetail(company.news[index]));

    details.append(summary, expanded);
    return details;
  }

  document.querySelectorAll("[data-portfolio-news]").forEach((root) => {
    const controls = root.querySelector("[data-news-controls]");
    const rows = root.querySelector("[data-news-rows]");
    const status = root.querySelector("[data-news-status]");
    const empty = root.querySelector("[data-news-empty]");
    const refresh = root.querySelector("[data-news-refresh]");
    let companies = [];

    function filteredCompanies() {
      const query = controls.elements.query.value.trim().toLocaleLowerCase("de-DE");
      const showEmpty = controls.elements.showEmpty.checked;
      const filtered = companies.filter((company) => {
        if (!showEmpty && !company.news.length) return false;
        if (!query) return true;
        const haystack = [company.name, ...company.news.flatMap((news) => [news.title, news.summary])]
          .join(" ")
          .toLocaleLowerCase("de-DE");
        return haystack.includes(query);
      });

      return filtered.sort(controls.elements.sort.value === "name"
        ? (a, b) => a.name.localeCompare(b.name, "de-DE")
        : (a, b) => b.newestDate - a.newestDate || a.name.localeCompare(b.name, "de-DE"));
    }

    function render() {
      const filtered = filteredCompanies();
      rows.replaceChildren(...filtered.map(createCompanyRow));
      empty.hidden = filtered.length > 0;
    }

    async function loadNews() {
      refresh.disabled = true;
      status.textContent = "News werden geladen …";
      try {
        const separator = root.dataset.source.includes("?") ? "&" : "?";
        const response = await fetch(`${root.dataset.source}${separator}v=${Date.now()}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const records = await response.json();
        if (!Array.isArray(records)) throw new Error("Unexpected data format");
        companies = normalizeCompanies(records);
        render();
        status.textContent = `${companies.length} Unternehmen · Zuletzt geladen: ${germanDateTime.format(new Date())} Uhr`;
      } catch (error) {
        status.textContent = "Die News konnten gerade nicht geladen werden. Bitte erneut versuchen.";
        rows.replaceChildren();
        empty.hidden = true;
      } finally {
        refresh.disabled = false;
      }
    }

    controls.addEventListener("input", render);
    controls.addEventListener("change", render);
    controls.addEventListener("submit", (event) => event.preventDefault());
    refresh.addEventListener("click", loadNews);
    loadNews();
  });
})();
