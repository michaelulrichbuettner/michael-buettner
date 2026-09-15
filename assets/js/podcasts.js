(function () {
  "use strict";

  // Maintain the selected episodes here. Audio stays on the original host.
  // Keep each show's episodes together; array order is display order.
  const episodes = [
    {
      id: "casa-casi-167",
      podcast: "Casa Casi",
      provider: "Transistor",
      episode: 167,
      title: "Was können die besten Handys 2026?",
      date: "2025-09-26",
      topic: "Smartphones & KI",
      url: "https://www.casacasi.de/episodes/was-konnen-die-besten-handys-2026",
      audioUrl: "https://media.transistor.fm/128cbf63/44160c35.mp3"
    },
    {
      id: "casa-casi-154",
      podcast: "Casa Casi",
      provider: "Transistor",
      episode: 154,
      title: "Wann geben E-Motorräder endlich richtig Vollgas?",
      date: "2025-03-29",
      topic: "Elektromobilität",
      url: "https://www.casacasi.de/episodes/wann-geben-e-motorrader-endlich-vollgas",
      audioUrl: "https://media.transistor.fm/09af4c1b/7649706f.mp3"
    },
    {
      id: "casa-casi-151",
      podcast: "Casa Casi",
      provider: "Transistor",
      episode: 151,
      title: "Wer soll Kanzler werden? So wählt Ihr richtig!",
      date: "2025-02-15",
      topic: "Digitale Orientierung",
      url: "https://www.casacasi.de/episodes/wer-soll-kanzler-werden-so-wahlt-ihr-richtig",
      audioUrl: "https://media.transistor.fm/4f9b79f4/6452ae54.mp3"
    },
    {
      id: "casa-casi-146",
      podcast: "Casa Casi",
      provider: "Transistor",
      episode: 146,
      title: "Sterben 2.0: Was bleibt digital von uns nach dem Tod?",
      date: "2024-12-07",
      topic: "Digitaler Nachlass",
      url: "https://www.casacasi.de/episodes/sterben-2-0-was-bleibt-digital-von-uns-nach-dem-tod",
      audioUrl: "https://media.transistor.fm/73c98387/265b1f37.mp3"
    },
    {
      id: "casa-casi-145",
      podcast: "Casa Casi",
      provider: "Transistor",
      episode: 145,
      title: "Der Black Friday ist schon wieder da – und Oppo auch!",
      date: "2024-11-23",
      topic: "Konsum & Smartphones",
      url: "https://www.casacasi.de/episodes/der-black-friday-ist-schon-wieder-da-und-oppo-auch",
      audioUrl: "https://media.transistor.fm/75052425/d056335b.mp3"
    },
    {
      id: "uebermorgen-5",
      podcast: "überMORGEN",
      provider: "Podigee",
      episode: 5,
      title: "CES 2024: Das Messe-Special",
      date: "2024-01-11",
      topic: "Technik & Messe",
      url: "https://morgen.podigee.io/5-5-ces-2024-das-messe-special-ubermorgen",
      audioUrl: "https://audio.podigee-cdn.net/1332092-m-b75a34a1e61bd34f4acbad059be00bb7.mp3?source=feed"
    }
  ];

  const root = document.querySelector("[data-podcasts]");
  if (!root) return;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  const dateFormatter = new Intl.DateTimeFormat("de-DE", {
    day: "2-digit", month: "long", year: "numeric"
  });

  root.innerHTML = episodes.map((episode) => {
    const title = escapeHtml(episode.title);
    const date = dateFormatter.format(new Date(`${episode.date}T12:00:00`));
    return `
      <article class="post-card podcast-card${episode.podcast === "überMORGEN" ? " podcast-card--uebermorgen" : ""}" aria-labelledby="${episode.id}-title">
        <div class="podcast-card__cover">
          <div class="podcast-card__cover-top"><span>Podcast</span><span>Folge ${episode.episode}</span></div>
          <div class="podcast-card__cover-bottom">
            <span class="podcast-card__brand">${escapeHtml(episode.podcast)}</span>
            <svg class="podcast-card__sound" viewBox="0 0 60 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M2 17v6m7-13v20m7-24v28m7-20v12m7-24v36m7-28v20m7-24v28m7-20v12m7-9v6"/></svg>
          </div>
        </div>
        <div class="post-card__meta"><time datetime="${episode.date}">${date}</time><span aria-hidden="true">·</span><span>Gast</span></div>
        <h3 id="${episode.id}-title"><a href="${escapeHtml(episode.url)}" target="_blank" rel="noopener noreferrer">${title}</a></h3>
        <span class="tag podcast-card__topic">${escapeHtml(episode.topic)}</span>
        <div class="podcast-card__player">
          <button class="button button--secondary podcast-card__listen" type="button" data-podcast-load="${episode.id}" aria-controls="${episode.id}-audio" aria-label="Folge anhören: ${title}. Audio von ${episode.provider} laden.">
            <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><path d="M4 2v12l10-6z"/></svg>Folge anhören
          </button>
          <audio id="${episode.id}-audio" controls preload="none" aria-label="${escapeHtml(episode.podcast)}: ${title}" hidden></audio>
          <p class="podcast-card__status" role="status" hidden></p>
        </div>
        <a class="podcast-card__original" href="${escapeHtml(episode.url)}" target="_blank" rel="noopener noreferrer" aria-label="Zur Podcastfolge: ${title}">Zur Podcastfolge <span aria-hidden="true">↗</span></a>
      </article>`;
  }).join("");

  const players = [...root.querySelectorAll("audio")];

  function pauseOthers(activePlayer) {
    players.forEach((player) => {
      if (player !== activePlayer) player.pause();
    });
  }

  players.forEach((player) => {
    const status = player.parentElement.querySelector(".podcast-card__status");
    player.addEventListener("play", () => pauseOthers(player));
    player.addEventListener("playing", () => { status.hidden = true; });
    player.addEventListener("error", () => {
      status.textContent = "Audio konnte nicht geladen werden. Bitte nutze den Link zur Podcastfolge.";
      status.hidden = false;
    });
  });

  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-podcast-load]");
    if (!button) return;
    const episode = episodes.find((item) => item.id === button.dataset.podcastLoad);
    const player = document.getElementById(`${episode.id}-audio`);
    const status = player.parentElement.querySelector(".podcast-card__status");

    // No audio source or third-party requests before this deliberate click.
    pauseOthers(player);
    player.src = episode.audioUrl;
    player.hidden = false;
    button.hidden = true;
    player.focus();
    player.play().catch((error) => {
      if (error.name === "AbortError" || player.error) return;
      status.textContent = "Bitte starte die Wiedergabe über die Play-Taste im Player.";
      status.hidden = false;
    });
  });
})();
