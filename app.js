(function () {
  const state = {
    activeTab: "differential",
    currentReportText: "",
    players: [],
    selectedXi: [],
    dataSource: "loading",
    isBusy: false,
    theme: "light"
  };

  const tabs = document.querySelectorAll(".tab-button");
  const panels = {
    differential: document.getElementById("differential-panel"),
    captaincy: document.getElementById("captaincy-panel")
  };
  const differentialForm = document.getElementById("differential-form");
  const captaincyForm = document.getElementById("captaincy-form");
  const statusLine = document.getElementById("status-line");
  const resultOutput = document.getElementById("result-output");
  const copyButton = document.getElementById("copy-report");
  const modelChip = document.getElementById("model-chip");
  const themeButton = document.getElementById("theme-toggle");
  const dataSourceLine = document.getElementById("data-source-line");
  const diffSearch = document.getElementById("differential-player-search");
  const diffPosition = document.getElementById("differential-position-filter");
  const diffResults = document.getElementById("differential-player-results");
  const squadSearch = document.getElementById("squad-player-search");
  const squadPosition = document.getElementById("squad-position-filter");
  const squadResults = document.getElementById("squad-player-results");
  const selectedXiList = document.getElementById("selected-xi-list");
  const xiCount = document.getElementById("xi-count");
  const xiBudget = document.getElementById("xi-budget");
  const positionCounts = document.getElementById("position-counts");

  const sampleDifferential = {
    name: "Xavi Simons",
    position: "MID",
    ownership: "4.2",
    price: "$7.5m",
    team: "Netherlands",
    fixture: "vs Canada",
    form: "Likely starter, creative midfield role, some set pieces, 2 assists in last 4 internationals.",
    context: "Good chance creation floor but goal threat can be streaky. Netherlands expected to dominate possession."
  };

  const sampleXiNames = [
    "Gianluigi Donnarumma",
    "Achraf Hakimi",
    "Theo Hernandez",
    "Alphonso Davies",
    "Jude Bellingham",
    "Xavi Simons",
    "Jamal Musiala",
    "Federico Valverde",
    "Joshua Kimmich",
    "Kylian Mbappe",
    "Harry Kane"
  ];

  init();

  function init() {
    initTheme();

    tabs.forEach((tab) => tab.addEventListener("click", () => setActiveTab(tab.dataset.tab)));

    if (themeButton) {
      themeButton.addEventListener("click", toggleTheme);
    }

    diffSearch.addEventListener("input", () => renderPlayerResults("differential"));
    diffPosition.addEventListener("change", () => renderPlayerResults("differential"));
    diffResults.addEventListener("click", handlePlayerResultClick);

    squadSearch.addEventListener("input", () => renderPlayerResults("squad"));
    squadPosition.addEventListener("change", () => renderPlayerResults("squad"));
    squadResults.addEventListener("click", handlePlayerResultClick);
    selectedXiList.addEventListener("click", handleXiClick);

    document.getElementById("load-differential-sample").addEventListener("click", () => {
      fillDifferentialForm(sampleDifferential);
    });

    document.getElementById("load-xi-sample").addEventListener("click", () => {
      loadSampleXi();
      captaincyForm.elements.context.value = "MD2. Prioritize minutes security, set pieces, fixture control, and late kickoff flexibility.";
    });

    document.getElementById("clear-xi").addEventListener("click", () => {
      state.selectedXi = [];
      renderSelectedXi();
    });

    differentialForm.addEventListener("submit", (event) => {
      event.preventDefault();
      analyze("differential", formToObject(differentialForm));
    });

    captaincyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (state.selectedXi.length < 3) {
        showError("Add at least three players before optimizing captaincy.");
        return;
      }

      analyze("captaincy", {
        players: state.selectedXi,
        context: captaincyForm.elements.context.value.trim()
      });
    });

    captaincyForm.addEventListener("reset", () => {
      window.setTimeout(() => {
        state.selectedXi = [];
        renderSelectedXi();
      }, 0);
    });

    copyButton.addEventListener("click", async () => {
      if (!state.currentReportText) return;
      try {
        await navigator.clipboard.writeText(state.currentReportText);
        setStatus("Report copied.");
      } catch (error) {
        showError("Could not copy the report. Your browser blocked clipboard access.");
      }
    });

    renderSelectedXi();
    loadPlayers();
  }

  function initTheme() {
    const savedTheme = safeLocalStorageGet("wcf-theme");
    const systemTheme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
    applyTheme(savedTheme === "dark" || savedTheme === "light" ? savedTheme : systemTheme, false);
  }

  function toggleTheme() {
    applyTheme(state.theme === "dark" ? "light" : "dark", true);
  }

  function applyTheme(theme, persist) {
    state.theme = theme;
    document.documentElement.dataset.theme = theme;

    if (themeButton) {
      themeButton.setAttribute("aria-pressed", String(theme === "dark"));
      themeButton.title = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
      const label = themeButton.querySelector(".theme-toggle-label");
      if (label) label.textContent = theme === "dark" ? "Light" : "Dark";
    }

    if (persist) {
      try {
        window.localStorage.setItem("wcf-theme", theme);
      } catch (error) {
        // Theme still changes for the current page even when storage is blocked.
      }
    }
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  async function loadPlayers() {
    try {
      const response = await fetch("/api/players");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load player data.");

      state.players = Array.isArray(data.players) ? data.players : [];
      state.dataSource = data.source || "unknown";
      dataSourceLine.textContent = data.warning
        ? `${data.sourceLabel || "Player data"} - ${data.warning}`
        : `${data.sourceLabel || "Player data"} - ${state.players.length} players loaded`;
      dataSourceLine.classList.toggle("warning", Boolean(data.warning || data.source === "sample"));
      renderPlayerResults("differential");
      renderPlayerResults("squad");
    } catch (error) {
      dataSourceLine.textContent = error.message || "Could not load player data.";
      dataSourceLine.classList.add("warning");
      renderEmptyResults(diffResults, "Player pool unavailable.");
      renderEmptyResults(squadResults, "Player pool unavailable.");
    }
  }

  function setActiveTab(tabName) {
    state.activeTab = tabName;
    tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === tabName));
    Object.entries(panels).forEach(([name, panel]) => {
      panel.classList.toggle("active", name === tabName);
    });
  }

  function setStatus(message) {
    statusLine.textContent = message;
  }

  function setBusy(isBusy) {
    state.isBusy = isBusy;
    document.querySelectorAll("[data-busy-lock]").forEach((button) => {
      button.disabled = isBusy;
    });
    copyButton.disabled = isBusy || !state.currentReportText;
  }

  function formToObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function renderPlayerResults(target) {
    const config = target === "squad"
      ? { search: squadSearch, position: squadPosition, container: squadResults, action: "Add to XI" }
      : { search: diffSearch, position: diffPosition, container: diffResults, action: "Select" };

    const query = config.search.value.trim().toLowerCase();
    const position = config.position.value;
    const players = state.players
      .filter((player) => !position || player.position === position)
      .filter((player) => {
        if (!query) return true;
        return [player.name, player.shortName, player.team, player.position]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => {
        const ownA = Number(a.ownership) || 100;
        const ownB = Number(b.ownership) || 100;
        return ownA - ownB || String(a.name).localeCompare(String(b.name));
      })
      .slice(0, 10);

    if (!players.length) {
      renderEmptyResults(config.container, state.players.length ? "No matching players." : "Loading players...");
      return;
    }

    config.container.innerHTML = players.map((player) => renderPlayerOption(player, target, config.action)).join("");
  }

  function renderPlayerOption(player, target, action) {
    const selected = state.selectedXi.some((item) => item.id === player.id);
    return `
      <button class="player-option" type="button" data-player-id="${escapeHtml(player.id)}" data-target="${target}" ${target === "squad" && selected ? "disabled" : ""}>
        <span class="player-main">
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml([player.team, player.fixture].filter(Boolean).join(" - ") || "Fixture TBC")}</span>
        </span>
        <span class="player-meta">
          <span class="mini-pill">${escapeHtml(player.position)}</span>
          <span class="mini-pill">${escapeHtml(player.price || "Price TBC")}</span>
          <span class="mini-pill ${Number(player.ownership) < 5 ? "green" : ""}">${escapeHtml(ownershipText(player.ownership))}</span>
          <span class="mini-action">${selected && target === "squad" ? "Added" : action}</span>
        </span>
      </button>
    `;
  }

  function renderEmptyResults(container, message) {
    container.innerHTML = `<div class="pool-empty">${escapeHtml(message)}</div>`;
  }

  function handlePlayerResultClick(event) {
    const button = event.target.closest(".player-option");
    if (!button) return;

    const player = getPlayerById(button.dataset.playerId);
    if (!player) return;

    if (button.dataset.target === "squad") {
      addPlayerToXi(player);
      renderPlayerResults("squad");
      return;
    }

    fillDifferentialForm(player);
  }

  function handleXiClick(event) {
    const button = event.target.closest("[data-remove-player]");
    if (!button) return;
    state.selectedXi = state.selectedXi.filter((player) => player.id !== button.dataset.removePlayer);
    renderSelectedXi();
    renderPlayerResults("squad");
  }

  function addPlayerToXi(player) {
    if (state.selectedXi.some((item) => item.id === player.id)) return;
    if (state.selectedXi.length >= 11) {
      showError("Your starting XI already has 11 players. Remove someone before adding another.");
      return;
    }
    state.selectedXi.push(player);
    renderSelectedXi();
  }

  function renderSelectedXi() {
    xiCount.textContent = `${state.selectedXi.length} / 11 players`;
    xiBudget.textContent = formatBudget(state.selectedXi);
    positionCounts.innerHTML = ["GK", "DEF", "MID", "FWD"].map((position) => {
      const count = state.selectedXi.filter((player) => player.position === position).length;
      return `<span class="mini-pill">${position} ${count}</span>`;
    }).join("");

    if (!state.selectedXi.length) {
      selectedXiList.innerHTML = `<div class="pool-empty">Search the pool and add players to your XI.</div>`;
      return;
    }

    selectedXiList.innerHTML = state.selectedXi.map((player) => `
      <article class="xi-card">
        <div>
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml(player.team || "Team TBC")} - ${escapeHtml(player.fixture || "Fixture TBC")}</span>
        </div>
        <div class="xi-card-meta">
          <span class="mini-pill">${escapeHtml(player.position)}</span>
          <span class="mini-pill">${escapeHtml(ownershipText(player.ownership))}</span>
          <button class="remove-player" type="button" data-remove-player="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">&times;</button>
        </div>
      </article>
    `).join("");
  }

  function loadSampleXi() {
    const chosen = sampleXiNames
      .map((name) => state.players.find((player) => player.name === name))
      .filter(Boolean);

    state.selectedXi = chosen.slice(0, 11);
    renderSelectedXi();
    renderPlayerResults("squad");
  }

  function fillDifferentialForm(player) {
    const values = {
      name: player.name || "",
      position: player.position || "MID",
      ownership: player.ownership ?? "",
      price: player.price || "",
      team: player.team || "",
      fixture: player.fixture || "",
      form: player.form || "",
      context: player.context || (player.status ? `Status: ${player.status}` : "")
    };

    Object.entries(values).forEach(([key, value]) => {
      const field = differentialForm.elements[key];
      if (field) field.value = value;
    });
  }

  function getPlayerById(id) {
    return state.players.find((player) => player.id === id);
  }

  function formatBudget(players) {
    const total = players.reduce((sum, player) => sum + priceNumber(player.price), 0);
    return `$${total.toFixed(1)}m`;
  }

  function priceNumber(value) {
    const match = String(value || "").match(/[\d.]+/);
    return match ? Number(match[0]) : 0;
  }

  function ownershipText(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(number % 1 ? 1 : 0)}%` : "Own TBC";
  }

  function showLoading(title) {
    resultOutput.className = "loading-state";
    resultOutput.innerHTML = `
      <div class="pitch-visual" aria-hidden="true"><span></span><span></span><span></span></div>
      <h3>${escapeHtml(title)}</h3>
      <p>Building a scoring-aware scout report...</p>
    `;
  }

  function showError(message) {
    state.currentReportText = "";
    copyButton.disabled = true;
    resultOutput.className = "";
    resultOutput.innerHTML = `<div class="error-state">${escapeHtml(message)}</div>`;
  }

  function showReport(report, tool) {
    state.currentReportText = reportToText(report, tool);
    copyButton.disabled = false;
    resultOutput.className = "report-stack";
    resultOutput.innerHTML = tool === "captaincy" ? renderCaptaincy(report) : renderDifferential(report);
  }

  function renderDifferential(report) {
    const verdictClass = verdictTone(report.verdict);
    const scoreRows = list(report.scoreBreakdown)
      .map((item) => `
        <li>
          <span><strong>${escapeHtml(item.label || "Action")}</strong>${item.note ? ` <span>${escapeHtml(item.note)}</span>` : ""}</span>
          <span class="score-points">${escapeHtml(pointsText(item.points))}</span>
        </li>
      `)
      .join("");

    const risks = list(report.risks).map((risk) => `<li>${escapeHtml(risk)}</li>`).join("");
    const bonus = report.scoutingBonus || {};

    return `
      <article class="report-card accent">
        <div class="report-kicker">Verdict</div>
        <h3>${escapeHtml(report.title || "Differential Report")}</h3>
        <p>${escapeHtml(report.headline || report.summary || "No headline returned.")}</p>
        <div class="verdict-row">
          <span class="pill ${verdictClass}">${escapeHtml(report.verdict || "Review")}</span>
          <span class="pill">${escapeHtml(report.confidence || "Medium confidence")}</span>
          <span class="pill ${bonus.eligible ? "green" : "gold"}">${bonus.eligible ? "Bonus eligible" : "Bonus uncertain"}</span>
        </div>
      </article>
      <article class="report-card">
        <div class="report-kicker">Point Ceiling</div>
        <h3>${escapeHtml(pointsText(report.totalCeiling || "TBD"))}</h3>
        <ul class="score-list">${scoreRows || "<li><span>No breakdown returned.</span><span></span></li>"}</ul>
      </article>
      <article class="report-card warning">
        <div class="report-kicker">Scouting Bonus</div>
        <h3>${bonus.eligible ? "+2 applies if he reaches 4 points" : "Needs ownership and 4-point check"}</h3>
        <p>${escapeHtml(bonus.reason || "No bonus explanation returned.")}</p>
      </article>
      <article class="report-card">
        <div class="report-kicker">Risks</div>
        <ul class="plain-list">${risks || "<li>No major risks returned.</li>"}</ul>
      </article>
      <article class="report-card accent">
        <div class="report-kicker">Final Call</div>
        <p>${escapeHtml(report.recommendation || "No recommendation returned.")}</p>
      </article>
    `;
  }

  function renderCaptaincy(report) {
    const rankings = list(report.rankings)
      .map((player) => `
        <li>
          <strong>${escapeHtml(`#${player.rank || ""} ${player.name || "Player"}`)}</strong>
          <div class="ranking-meta">
            <span class="pill">${escapeHtml(player.team || "Team")}</span>
            <span class="pill">${escapeHtml(player.fixture || "Fixture")}</span>
            <span class="pill ${confidenceTone(player.confidence)}">${escapeHtml(player.confidence || "Medium")}</span>
            ${player.differential ? '<span class="pill green">Under 5% punt</span>' : ""}
          </div>
          <p>${escapeHtml(player.caseFor || player.reason || "No captaincy case returned.")}</p>
          ${player.risk ? `<p><strong>Risk:</strong> ${escapeHtml(player.risk)}</p>` : ""}
        </li>
      `)
      .join("");

    const punts = list(report.differentialPunts).map((punt) => `<li>${escapeHtml(punt)}</li>`).join("");
    const risks = list(report.risks).map((risk) => `<li>${escapeHtml(risk)}</li>`).join("");
    const vice = report.viceCaptain || {};

    return `
      <article class="report-card accent">
        <div class="report-kicker">Recommendation</div>
        <h3>${escapeHtml(report.title || "Captaincy Report")}</h3>
        <p>${escapeHtml(report.headline || report.summary || "No headline returned.")}</p>
      </article>
      <article class="report-card">
        <div class="report-kicker">Top 3</div>
        <ol class="ranking-list">${rankings || "<li>No rankings returned.</li>"}</ol>
      </article>
      <article class="report-card warning">
        <div class="report-kicker">Vice Captain</div>
        <h3>${escapeHtml(vice.name || "No vice-captain returned")}</h3>
        <p>${escapeHtml(vice.reason || "No vice-captain explanation returned.")}</p>
      </article>
      <article class="report-card">
        <div class="report-kicker">Differential Punts</div>
        <ul class="plain-list">${punts || "<li>No under-5% captaincy punts found in this XI.</li>"}</ul>
      </article>
      <article class="report-card danger">
        <div class="report-kicker">Risks</div>
        <ul class="plain-list">${risks || "<li>No major risks returned.</li>"}</ul>
      </article>
      <article class="report-card accent">
        <div class="report-kicker">Final Call</div>
        <p>${escapeHtml(report.recommendation || "No recommendation returned.")}</p>
      </article>
    `;
  }

  async function analyze(tool, payload) {
    if (state.isBusy) return;

    setBusy(true);
    setStatus("Asking GitHub Models...");
    showLoading(tool === "captaincy" ? "Optimizing captaincy" : "Analyzing differential");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tool, payload })
      });
      const text = await response.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch (error) {
        data = { error: text || "The server returned an unreadable response." };
      }

      if (!response.ok) {
        throw new Error(data.error || "The model request failed.");
      }

      if (data.model) modelChip.textContent = data.model;
      setStatus("Report generated.");
      showReport(data.report, tool);
    } catch (error) {
      setStatus("Could not generate report.");
      showError(error.message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function reportToText(report, tool) {
    if (!report) return "";
    if (tool === "captaincy") {
      const rankings = list(report.rankings)
        .map((player) => `${player.rank || "-"} ${player.name || "Player"} (${player.confidence || "Medium"}): ${player.caseFor || player.reason || ""}`)
        .join("\n");
      return [
        report.title || "Captaincy Report",
        report.headline || "",
        "",
        rankings,
        "",
        `Vice captain: ${(report.viceCaptain || {}).name || "TBD"}`,
        (report.viceCaptain || {}).reason || "",
        "",
        report.recommendation || ""
      ].join("\n").trim();
    }

    const breakdown = list(report.scoreBreakdown)
      .map((item) => `- ${item.label || "Action"}: ${pointsText(item.points)} ${item.note || ""}`)
      .join("\n");
    return [
      report.title || "Differential Report",
      `${report.verdict || "Verdict"} - ${report.confidence || "Confidence"}`,
      report.headline || "",
      "",
      `Total ceiling: ${pointsText(report.totalCeiling || "TBD")}`,
      breakdown,
      "",
      report.recommendation || ""
    ].join("\n").trim();
  }

  function list(value) {
    return Array.isArray(value) ? value : [];
  }

  function pointsText(value) {
    if (typeof value === "number") return `${value} pts`;
    return String(value || "");
  }

  function verdictTone(verdict) {
    const text = String(verdict || "").toLowerCase();
    if (text.includes("strong")) return "green";
    if (text.includes("risky") || text.includes("avoid")) return "red";
    return "gold";
  }

  function confidenceTone(confidence) {
    const text = String(confidence || "").toLowerCase();
    if (text.includes("high")) return "green";
    if (text.includes("low")) return "red";
    return "gold";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
