(function () {
  const state = {
    activeTab: "differential",
    currentReportText: "",
    players: [],
    selectedXi: [],
    starterIds: [],
    captainId: "",
    viceId: "",
    rules: null,
    dataSource: "loading",
    isBusy: false,
    theme: "light"
  };

  const DEFAULT_RULES = {
    stage: "GROUP",
    budget: 100,
    maxPerTeam: 3,
    squadSize: 15,
    lineupSize: 11,
    positionTargets: {
      GK: 2,
      DEF: 5,
      MID: 5,
      FWD: 3
    },
    allowedFormations: ["4-4-2", "4-3-3", "4-5-1", "3-4-3", "3-5-2", "5-4-1", "5-3-2"]
  };
  const POSITION_ORDER = ["GK", "DEF", "MID", "FWD"];
  const SQUAD_STORAGE_KEY = "wcf-scout-squad";

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
  const squadRuleSummary = document.getElementById("squad-rule-summary");
  const squadValidation = document.getElementById("squad-validation");
  const lineupCount = document.getElementById("lineup-count");
  const lineupFormation = document.getElementById("lineup-formation");
  const captainChip = document.getElementById("captain-chip");
  const viceChip = document.getElementById("vice-chip");
  const captaincySubmit = captaincyForm.querySelector("[data-busy-lock]");

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
      state.starterIds = [];
      state.captainId = "";
      state.viceId = "";
      persistSquad();
      renderSelectedXi();
      renderPlayerResults("squad");
    });

    differentialForm.addEventListener("submit", (event) => {
      event.preventDefault();
      analyze("differential", formToObject(differentialForm));
    });

    captaincyForm.addEventListener("submit", (event) => {
      event.preventDefault();
      const validation = validateLineup();
      if (!validation.canAnalyze) {
        renderSelectedXi();
        showError(validation.issues[0] || "Build a valid starting XI before optimizing captaincy.");
        return;
      }

      analyze("captaincy", {
        players: lineupPlayers().map((player) => ({
          ...player,
          role: player.id === state.captainId ? "captain" : player.id === state.viceId ? "vice captain" : "starter"
        })),
        captain: getPlayerById(state.captainId),
        viceCaptain: getPlayerById(state.viceId),
        bench: benchPlayers(),
        squadSummary: squadSummary(),
        context: captaincyForm.elements.context.value.trim()
      });
    });

    captaincyForm.addEventListener("reset", () => {
      window.setTimeout(() => {
        state.selectedXi = [];
        state.starterIds = [];
        state.captainId = "";
        state.viceId = "";
        persistSquad();
        renderSelectedXi();
        renderPlayerResults("squad");
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
    let data;

    try {
      const response = await fetch("/api/players");
      data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load player data.");
    } catch (error) {
      state.rules = normalizeRules();
      dataSourceLine.textContent = error.message || "Could not load player data.";
      dataSourceLine.classList.add("warning");
      renderEmptyResults(diffResults, "Player pool unavailable.");
      renderEmptyResults(squadResults, "Player pool unavailable.");
      renderSelectedXi();
      return;
    }

    state.players = Array.isArray(data.players) ? data.players : [];
    state.dataSource = data.source || "unknown";
    state.rules = normalizeRules(data.rules);
    dataSourceLine.textContent = data.warning
      ? `${data.sourceLabel || "Player data"} - ${data.warning}`
      : `${data.sourceLabel || "Player data"} - ${state.players.length} players loaded`;
    dataSourceLine.classList.toggle("warning", Boolean(data.warning || data.source === "sample"));

    try {
      hydrateSquad();
      renderSelectedXi();
      renderPlayerResults("differential");
      renderPlayerResults("squad");
    } catch (error) {
      console.error(error);
      renderPlayerResults("differential");
      renderPlayerResults("squad");
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
    updateCaptaincySubmit();
    copyButton.disabled = isBusy || !state.currentReportText;
  }

  function formToObject(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function renderPlayerResults(target) {
    const config = target === "squad"
      ? { search: squadSearch, position: squadPosition, container: squadResults, action: "Add" }
      : { search: diffSearch, position: diffPosition, container: diffResults, action: "Select" };

    const query = config.search.value.trim().toLowerCase();
    const position = config.position.value;
    const players = state.players
      .filter((player) => !position || player.position === position)
      .filter((player) => {
        if (!query) return true;
        return [player.name, player.shortName, player.team, player.teamAbbr, player.position]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));
      })
      .sort((a, b) => {
        if (target === "squad") {
          const addA = playerAddState(a).ok ? 0 : 1;
          const addB = playerAddState(b).ok ? 0 : 1;
          if (addA !== addB) return addA - addB;
        }
        const ownA = Number(a.ownership) || 100;
        const ownB = Number(b.ownership) || 100;
        return ownA - ownB || String(a.name).localeCompare(String(b.name));
      })
      .slice(0, 12);

    if (!players.length) {
      renderEmptyResults(config.container, state.players.length ? "No matching players." : "Loading players...");
      return;
    }

    config.container.innerHTML = players.map((player) => renderPlayerOption(player, target, config.action)).join("");
  }

  function renderPlayerOption(player, target, action) {
    const selected = state.selectedXi.some((item) => item.id === player.id);
    const addState = target === "squad" ? playerAddState(player) : { ok: true, label: action };
    const disabled = target === "squad" && (selected || !addState.ok);
    const actionText = selected && target === "squad" ? "Added" : addState.label || action;

    return `
      <button class="player-option" type="button" data-player-id="${escapeHtml(player.id)}" data-target="${target}" ${disabled ? "disabled" : ""}>
        <span class="player-main">
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml([player.team, player.fixture].filter(Boolean).join(" - ") || "Fixture TBC")}</span>
        </span>
        <span class="player-meta">
          <span class="mini-pill">${escapeHtml(player.position)}</span>
          <span class="mini-pill">${escapeHtml(player.price || "Price TBC")}</span>
          <span class="mini-pill ${Number(player.ownership) < 5 ? "green" : ""}">${escapeHtml(ownershipText(player.ownership))}</span>
          ${target === "squad" && player.status && player.status !== "playing" ? `<span class="mini-pill red">${escapeHtml(player.status)}</span>` : ""}
          <span class="mini-action ${!addState.ok && target === "squad" ? "muted" : ""}">${escapeHtml(actionText)}</span>
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
      addPlayerToSquad(player);
      renderPlayerResults("squad");
      return;
    }

    fillDifferentialForm(player);
  }

  function handleXiClick(event) {
    const captainButton = event.target.closest("[data-captain-player]");
    if (captainButton) {
      setCaptain(captainButton.dataset.captainPlayer);
      return;
    }

    const viceButton = event.target.closest("[data-vice-player]");
    if (viceButton) {
      setViceCaptain(viceButton.dataset.vicePlayer);
      return;
    }

    const starterButton = event.target.closest("[data-toggle-starter]");
    if (starterButton) {
      toggleStarter(starterButton.dataset.toggleStarter);
      return;
    }

    const button = event.target.closest("[data-remove-player]");
    if (!button) return;
    removePlayerFromSquad(button.dataset.removePlayer);
  }

  function addPlayerToSquad(player, options = {}) {
    const addState = playerAddState(player);
    if (!addState.ok) {
      if (!options.silent) renderSquadValidation([addState.message]);
      return false;
    }

    state.selectedXi.push(player);

    if (canStartPlayer(player).ok) {
      state.starterIds.push(player.id);
    }

    ensureCaptaincy();
    persistSquad();
    renderSelectedXi();
    return true;
  }

  function removePlayerFromSquad(playerId) {
    state.selectedXi = state.selectedXi.filter((player) => player.id !== playerId);
    state.starterIds = state.starterIds.filter((id) => id !== playerId);
    if (state.captainId === playerId) state.captainId = "";
    if (state.viceId === playerId) state.viceId = "";
    ensureCaptaincy();
    persistSquad();
    renderSelectedXi();
    renderPlayerResults("squad");
  }

  function toggleStarter(playerId) {
    const player = getPlayerById(playerId);
    if (!player) return;

    if (state.starterIds.includes(playerId)) {
      state.starterIds = state.starterIds.filter((id) => id !== playerId);
      if (state.captainId === playerId) state.captainId = "";
      if (state.viceId === playerId) state.viceId = "";
    } else {
      const startState = canStartPlayer(player);
      if (!startState.ok) {
        renderSquadValidation([startState.message]);
        return;
      }
      state.starterIds.push(playerId);
    }

    ensureCaptaincy();
    persistSquad();
    renderSelectedXi();
  }

  function setCaptain(playerId) {
    if (!state.starterIds.includes(playerId)) return;
    state.captainId = playerId;
    if (state.viceId === playerId) {
      state.viceId = state.starterIds.find((id) => id !== playerId) || "";
    }
    ensureCaptaincy();
    persistSquad();
    renderSelectedXi();
  }

  function setViceCaptain(playerId) {
    if (!state.starterIds.includes(playerId)) return;
    state.viceId = playerId;
    if (state.captainId === playerId) {
      state.captainId = state.starterIds.find((id) => id !== playerId) || "";
    }
    ensureCaptaincy();
    persistSquad();
    renderSelectedXi();
  }

  function renderSelectedXi() {
    const rules = getRules();
    ensureCaptaincy();
    renderRuleSummary();

    const squadTotal = squadCost(state.selectedXi);
    const budgetLeft = Math.round((rules.budget - squadTotal) * 10) / 10;
    const starters = lineupPlayers();
    const bench = benchPlayers();
    const validation = validateLineup();
    const formation = currentFormation(starters);
    const captain = getPlayerById(state.captainId);
    const vice = getPlayerById(state.viceId);

    xiCount.textContent = `${state.selectedXi.length} / ${rules.squadSize} players`;
    xiBudget.textContent = `$${budgetLeft.toFixed(1)}m left`;
    xiBudget.classList.toggle("red", budgetLeft < 0);
    xiBudget.classList.toggle("green", budgetLeft >= 0 && state.selectedXi.length === rules.squadSize);

    positionCounts.innerHTML = POSITION_ORDER.map((position) => {
      const count = state.selectedXi.filter((player) => player.position === position).length;
      const target = rules.positionTargets[position];
      const tone = count === target ? "green" : count > target ? "red" : "";
      return `<span class="mini-pill ${tone}">${position} ${count}/${target}</span>`;
    }).join("");

    if (lineupCount) {
      lineupCount.textContent = `${starters.length} / ${rules.lineupSize} starters`;
      lineupCount.classList.toggle("green", starters.length === rules.lineupSize);
      lineupCount.classList.toggle("red", starters.length > rules.lineupSize);
    }
    if (lineupFormation) {
      lineupFormation.textContent = formation ? `${formation} formation` : "Formation TBC";
      lineupFormation.classList.toggle("green", Boolean(formation));
    }
    if (captainChip) {
      captainChip.textContent = captain ? `C ${captain.shortName || captain.name}` : "Captain TBC";
      captainChip.classList.toggle("green", Boolean(captain));
    }
    if (viceChip) {
      viceChip.textContent = vice ? `VC ${vice.shortName || vice.name}` : "Vice TBC";
      viceChip.classList.toggle("green", Boolean(vice));
    }

    renderSquadValidation(validation.issues, validation.canAnalyze);
    updateCaptaincySubmit(validation);

    if (!state.selectedXi.length) {
      selectedXiList.innerHTML = `<div class="pool-empty">Search the pool and add players to your squad.</div>`;
      return;
    }

    selectedXiList.innerHTML = `
      <div class="squad-group">
        <div class="squad-group-head">
          <h4>Starters</h4>
          <span>${escapeHtml(formation || "Incomplete")}</span>
        </div>
        ${starters.length ? starters.map((player) => renderSquadCard(player, true)).join("") : '<div class="pool-empty">No starters selected.</div>'}
      </div>
      <div class="squad-group">
        <div class="squad-group-head">
          <h4>Bench</h4>
          <span>${bench.length} / ${rules.squadSize - rules.lineupSize}</span>
        </div>
        ${bench.length ? bench.map((player) => renderSquadCard(player, false)).join("") : '<div class="pool-empty">Bench slots are empty.</div>'}
      </div>
    `;
  }

  function loadSampleXi() {
    state.selectedXi = [];
    state.starterIds = [];
    state.captainId = "";
    state.viceId = "";

    const preferredPlayers = sampleXiNames
      .map((name) => state.players.find((player) => player.name === name))
      .filter(Boolean);

    preferredPlayers.forEach((player) => addPlayerToSquad(player, { silent: true }));
    fillSquadByRules();
    ensureCaptaincy();
    persistSquad();
    renderSelectedXi();
    renderPlayerResults("squad");
  }

  function renderSquadCard(player, isStarter) {
    const isCaptain = player.id === state.captainId;
    const isVice = player.id === state.viceId;
    const startState = canStartPlayer(player);
    const canMoveToStart = isStarter || startState.ok;
    const role = isCaptain ? "Captain" : isVice ? "Vice" : isStarter ? "Starter" : "Bench";

    return `
      <article class="xi-card ${isStarter ? "starter" : "bench"} ${isCaptain ? "captain-card" : ""}">
        <div>
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml(player.team || "Team TBC")} - ${escapeHtml(player.fixture || "Fixture TBC")}</span>
        </div>
        <div class="xi-card-meta">
          <span class="mini-pill">${escapeHtml(player.position)}</span>
          <span class="mini-pill">${escapeHtml(player.price || "Price TBC")}</span>
          <span class="mini-pill ${Number(player.ownership) < 5 ? "green" : ""}">${escapeHtml(ownershipText(player.ownership))}</span>
          <span class="mini-pill ${isCaptain || isVice ? "green" : ""}">${escapeHtml(role)}</span>
          <button class="role-button ${isCaptain ? "active" : ""}" type="button" data-captain-player="${escapeHtml(player.id)}" ${isStarter ? "" : "disabled"} aria-pressed="${isCaptain}">C</button>
          <button class="role-button ${isVice ? "active" : ""}" type="button" data-vice-player="${escapeHtml(player.id)}" ${isStarter ? "" : "disabled"} aria-pressed="${isVice}">VC</button>
          <button class="ghost-mini" type="button" data-toggle-starter="${escapeHtml(player.id)}" ${canMoveToStart ? "" : "disabled"}>${isStarter ? "Bench" : "Start"}</button>
          <button class="remove-player" type="button" data-remove-player="${escapeHtml(player.id)}" aria-label="Remove ${escapeHtml(player.name)}">&times;</button>
        </div>
      </article>
    `;
  }

  function renderRuleSummary() {
    if (!squadRuleSummary) return;
    const rules = getRules();
    squadRuleSummary.innerHTML = `
      <span class="rule-chip">Budget $${rules.budget.toFixed(1)}m</span>
      <span class="rule-chip">Max ${rules.maxPerTeam} per country</span>
      <span class="rule-chip">Squad ${rules.squadSize}</span>
      <span class="rule-chip">${escapeHtml(stageLabel(rules.stage))}</span>
    `;
  }

  function renderSquadValidation(issues = [], ready = false) {
    if (!squadValidation) return;
    squadValidation.classList.toggle("ready", ready);
    squadValidation.classList.toggle("warning", !ready);
    if (ready) {
      squadValidation.textContent = "Starting XI ready for captaincy optimization.";
      return;
    }
    squadValidation.textContent = issues[0] || "Build your legal squad and starting XI.";
  }

  function playerAddState(player) {
    const rules = getRules();
    if (state.selectedXi.some((item) => item.id === player.id)) {
      return { ok: false, label: "Added", message: "That player is already in your squad." };
    }
    if (state.selectedXi.length >= rules.squadSize) {
      return { ok: false, label: "Full", message: `Your squad already has ${rules.squadSize} players.` };
    }
    if (player.status && ["transferred", "eliminated"].includes(player.status)) {
      return { ok: false, label: "Unavailable", message: `${player.name} is marked as ${player.status}.` };
    }
    if (player.isEliminated) {
      return { ok: false, label: "Eliminated", message: `${player.team} is marked as eliminated.` };
    }
    const target = rules.positionTargets[player.position] || 0;
    const currentPositionCount = state.selectedXi.filter((item) => item.position === player.position).length;
    if (currentPositionCount >= target) {
      return { ok: false, label: `${player.position} full`, message: `You already have ${target} ${player.position} players.` };
    }
    const countryCount = state.selectedXi.filter((item) => item.teamId === player.teamId).length;
    if (countryCount >= rules.maxPerTeam) {
      return { ok: false, label: "Country cap", message: `You can only pick ${rules.maxPerTeam} players from ${player.team}.` };
    }
    const nextCost = squadCost(state.selectedXi) + priceNumber(player.price);
    if (nextCost > rules.budget + 0.0001) {
      return { ok: false, label: "Over budget", message: `Adding ${player.name} would exceed the $${rules.budget.toFixed(1)}m budget.` };
    }
    return { ok: true, label: "Add" };
  }

  function canStartPlayer(player) {
    const rules = getRules();
    if (state.starterIds.includes(player.id)) return { ok: true };
    if (state.starterIds.length >= rules.lineupSize) {
      return { ok: false, message: "Your starting XI is already full. Bench someone first." };
    }

    const starters = lineupPlayers().concat(player);
    const counts = positionMap(starters);
    if (counts.GK > 1) {
      return { ok: false, message: "A starting XI can only have one goalkeeper." };
    }
    if (!canBecomeValidFormation(counts, starters.length)) {
      return { ok: false, message: `${player.position} would make the formation invalid.` };
    }
    return { ok: true };
  }

  function validateLineup() {
    const rules = getRules();
    const issues = [];
    const starters = lineupPlayers();
    const formation = currentFormation(starters);
    const squadPositions = positionMap(state.selectedXi);

    POSITION_ORDER.forEach((position) => {
      const target = rules.positionTargets[position];
      if (squadPositions[position] > target) issues.push(`Too many ${position} players in the squad.`);
    });

    if (squadCost(state.selectedXi) > rules.budget + 0.0001) {
      issues.push(`Squad is over the $${rules.budget.toFixed(1)}m budget.`);
    }

    const countryCounts = teamCounts(state.selectedXi);
    const overCountry = Object.entries(countryCounts).find(([, count]) => count > rules.maxPerTeam);
    if (overCountry) {
      const teamName = state.selectedXi.find((player) => player.teamId === overCountry[0])?.team || "one country";
      issues.push(`Too many players from ${teamName}. Max is ${rules.maxPerTeam}.`);
    }

    if (starters.length < rules.lineupSize) issues.push(`Pick ${rules.lineupSize - starters.length} more starter${rules.lineupSize - starters.length === 1 ? "" : "s"}.`);
    if (starters.length > rules.lineupSize) issues.push("Too many starters selected.");
    if (starters.length === rules.lineupSize && !formation) issues.push("Starting XI formation is invalid.");
    if (starters.length >= 1 && !state.captainId) issues.push("Choose a captain.");
    if (starters.length >= 2 && !state.viceId) issues.push("Choose a vice captain.");
    if (state.captainId && state.captainId === state.viceId) issues.push("Captain and vice captain must be different.");

    return {
      canAnalyze: issues.length === 0 && starters.length === rules.lineupSize && Boolean(formation),
      issues
    };
  }

  function fillSquadByRules() {
    const rules = getRules();
    POSITION_ORDER.forEach((position) => {
      while (state.selectedXi.filter((player) => player.position === position).length < rules.positionTargets[position]) {
        const candidate = state.players
          .filter((player) => player.position === position)
          .filter((player) => playerAddState(player).ok)
          .sort((a, b) => priceNumber(a.price) - priceNumber(b.price) || Number(b.ownership || 0) - Number(a.ownership || 0))[0];
        if (!candidate) break;
        addPlayerToSquad(candidate, { silent: true });
      }
    });
  }

  function lineupPlayers() {
    const starterSet = new Set(state.starterIds);
    return state.selectedXi.filter((player) => starterSet.has(player.id));
  }

  function benchPlayers() {
    const starterSet = new Set(state.starterIds);
    return state.selectedXi.filter((player) => !starterSet.has(player.id));
  }

  function ensureCaptaincy() {
    const starterIds = state.starterIds.filter((id) => state.selectedXi.some((player) => player.id === id));
    state.starterIds = starterIds;
    if (!starterIds.includes(state.captainId)) state.captainId = starterIds[0] || "";
    if (!starterIds.includes(state.viceId) || state.viceId === state.captainId) {
      state.viceId = starterIds.find((id) => id !== state.captainId) || "";
    }
  }

  function currentFormation(players) {
    const rules = getRules();
    const counts = positionMap(players);
    if (players.length !== rules.lineupSize || counts.GK !== 1) return "";
    const formation = `${counts.DEF}-${counts.MID}-${counts.FWD}`;
    return rules.allowedFormations.includes(formation) ? formation : "";
  }

  function canBecomeValidFormation(counts, totalStarters) {
    const rules = getRules();
    if (counts.GK > 1 || totalStarters > rules.lineupSize) return false;
    return rules.allowedFormations.some((formation) => {
      const [DEF, MID, FWD] = formation.split("-").map(Number);
      const target = { GK: 1, DEF, MID, FWD };
      return POSITION_ORDER.every((position) => counts[position] <= target[position]);
    });
  }

  function positionMap(players) {
    return POSITION_ORDER.reduce((counts, position) => {
      counts[position] = players.filter((player) => player.position === position).length;
      return counts;
    }, {});
  }

  function teamCounts(players) {
    return players.reduce((counts, player) => {
      const key = player.teamId || player.team || "unknown";
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {});
  }

  function squadSummary() {
    const rules = getRules();
    return {
      cost: `$${squadCost(state.selectedXi).toFixed(1)}m`,
      budget: `$${rules.budget.toFixed(1)}m`,
      formation: currentFormation(lineupPlayers()),
      squadSize: state.selectedXi.length,
      starters: lineupPlayers().length,
      maxPerTeam: rules.maxPerTeam
    };
  }

  function normalizeRules(rules = {}) {
    return {
      ...DEFAULT_RULES,
      ...rules,
      positionTargets: {
        ...DEFAULT_RULES.positionTargets,
        ...(rules.positionTargets || {})
      },
      allowedFormations: Array.isArray(rules.allowedFormations) && rules.allowedFormations.length
        ? rules.allowedFormations
        : DEFAULT_RULES.allowedFormations
    };
  }

  function getRules() {
    if (!state.rules) state.rules = normalizeRules();
    return state.rules;
  }

  function hydrateSquad() {
    const saved = safeLocalStorageGet(SQUAD_STORAGE_KEY);
    if (!saved || !state.players.length) return;
    try {
      const data = JSON.parse(saved);
      const savedIds = Array.isArray(data.playerIds) ? data.playerIds : [];
      const players = savedIds.map((id) => getPlayerById(id)).filter(Boolean);
      state.selectedXi = [];
      state.starterIds = [];
      state.captainId = "";
      state.viceId = "";
      players.forEach((player) => {
        if (playerAddState(player).ok) state.selectedXi.push(player);
      });
      state.starterIds = (Array.isArray(data.starterIds) ? data.starterIds : []).filter((id) => state.selectedXi.some((player) => player.id === id));
      state.captainId = data.captainId || "";
      state.viceId = data.viceId || "";
      ensureCaptaincy();
    } catch (error) {
      // Ignore corrupted saved squad data and let the user build again.
    }
  }

  function persistSquad() {
    try {
      window.localStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify({
        playerIds: state.selectedXi.map((player) => player.id),
        starterIds: state.starterIds,
        captainId: state.captainId,
        viceId: state.viceId
      }));
    } catch (error) {
      // The builder still works for the current session when storage is blocked.
    }
  }

  function updateCaptaincySubmit(validation = validateLineup()) {
    if (!captaincySubmit) return;
    captaincySubmit.disabled = state.isBusy || !validation.canAnalyze;
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
    const total = squadCost(players);
    return `$${total.toFixed(1)}m`;
  }

  function squadCost(players) {
    return players.reduce((sum, player) => sum + priceNumber(player.price), 0);
  }

  function priceNumber(value) {
    const match = String(value || "").match(/[\d.]+/);
    return match ? Number(match[0]) : 0;
  }

  function ownershipText(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(number % 1 ? 1 : 0)}%` : "Own TBC";
  }

  function stageLabel(stage) {
    return {
      GROUP: "Group stage",
      R32: "Round of 32",
      R16: "Round of 16",
      QF: "Quarter-final",
      SF: "Semi-final",
      F: "Final"
    }[stage] || "Current round";
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
