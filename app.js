(function () {
  const state = {
    activeTab: "differential",
    currentReportText: "",
    players: [],
    selectedDifferential: null,
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
  const diffCountry = document.getElementById("differential-country-filter");
  const diffResults = document.getElementById("differential-player-results");
  const squadSearch = document.getElementById("squad-player-search");
  const squadPosition = document.getElementById("squad-position-filter");
  const squadCountry = document.getElementById("squad-country-filter");
  const squadResults = document.getElementById("squad-player-results");
  const selectedXiList = document.getElementById("selected-xi-list");
  const xiCount = document.getElementById("xi-count");
  const xiBudget = document.getElementById("xi-budget");
  const positionCounts = document.getElementById("position-counts");
  const squadRuleSummary = document.getElementById("squad-rule-summary");
  const squadValidation = document.getElementById("squad-validation");
  const differentialSpotlight = document.getElementById("differential-spotlight");
  const lineupPitch = document.getElementById("lineup-pitch");
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

  const sampleSquadContexts = [
    "Random sample squad. Prioritize minutes security, set pieces, fixture control, and late kickoff flexibility.",
    "Random sample squad for captaincy testing. Compare premium safety against low-owned upside.",
    "Random sample squad. Look for reliable starters, attacking roles, and clean-sheet routes.",
    "Random sample squad. Treat rotation risk and ownership leverage as key tiebreakers."
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
    diffCountry.addEventListener("change", () => renderPlayerResults("differential"));
    diffResults.addEventListener("click", handlePlayerResultClick);

    squadSearch.addEventListener("input", () => renderPlayerResults("squad"));
    squadPosition.addEventListener("change", () => renderPlayerResults("squad"));
    squadCountry.addEventListener("change", () => renderPlayerResults("squad"));
    squadResults.addEventListener("click", handlePlayerResultClick);
    selectedXiList.addEventListener("click", handleXiClick);
    if (lineupPitch) lineupPitch.addEventListener("click", handleXiClick);

    document.getElementById("load-differential-sample").addEventListener("click", () => {
      loadRandomDifferentialSample();
    });

    document.getElementById("load-xi-sample").addEventListener("click", () => {
      loadSampleXi();
      captaincyForm.elements.context.value = randomChoice(sampleSquadContexts);
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

    differentialForm.addEventListener("reset", () => {
      window.setTimeout(() => {
        state.selectedDifferential = null;
        renderDifferentialSpotlight();
      }, 0);
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
    renderDifferentialSpotlight();
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
      populateCountryFilters(data.teams);
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
      ? { search: squadSearch, position: squadPosition, country: squadCountry, container: squadResults, action: "Add" }
      : { search: diffSearch, position: diffPosition, country: diffCountry, container: diffResults, action: "Spotlight" };

    const query = normalizeSearch(config.search.value.trim());
    const position = config.position.value;
    const country = config.country.value;
    const players = state.players
      .filter((player) => !position || player.position === position)
      .filter((player) => !country || player.team === country)
      .filter((player) => {
        if (!query) return true;
        const haystack = normalizeSearch([
          player.name,
          player.shortName,
          ...(Array.isArray(player.aliases) ? player.aliases : []),
          player.team,
          player.teamAbbr,
          player.position
        ].filter(Boolean).join(" "));
        return query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
      })
      .sort((a, b) => {
        if (target === "squad") {
          const addA = playerAddState(a).ok ? 0 : 1;
          const addB = playerAddState(b).ok ? 0 : 1;
          if (addA !== addB) return addA - addB;
        }
        const ownA = ownershipSortValue(a.ownership);
        const ownB = ownershipSortValue(b.ownership);
        return ownA - ownB || String(a.name).localeCompare(String(b.name));
      });
    const visiblePlayers = country ? players : players.slice(0, 12);

    if (!visiblePlayers.length) {
      renderEmptyResults(config.container, state.players.length ? "No matching players." : "Loading players...");
      return;
    }

    config.container.innerHTML = visiblePlayers.map((player) => renderPlayerOption(player, target, config.action)).join("");
  }

  function populateCountryFilters(sourceTeams = []) {
    const teams = Array.from(new Set(
      (Array.isArray(sourceTeams) && sourceTeams.length ? sourceTeams : state.players.map((player) => player.team))
        .filter(Boolean)
    )).sort((a, b) => String(a).localeCompare(String(b)));

    [diffCountry, squadCountry].forEach((select) => {
      if (!select) return;
      const currentValue = select.value;
      select.innerHTML = [
        '<option value="">All countries</option>',
        ...teams.map((team) => `<option value="${escapeHtml(team)}">${escapeHtml(team)}</option>`)
      ].join("");
      select.value = teams.includes(currentValue) ? currentValue : "";
    });
  }

  function renderPlayerOption(player, target, action) {
    const selected = state.selectedXi.some((item) => item.id === player.id);
    const addState = target === "squad" ? playerAddState(player) : { ok: true, label: action };
    const disabled = target === "squad" && (selected || !addState.ok);
    const actionText = selected && target === "squad" ? "Added" : addState.label || action;

    return `
      <article class="player-option ${disabled ? "is-disabled" : ""}" data-player-id="${escapeHtml(player.id)}" data-target="${target}">
        <span class="player-shirt ${shirtClass(player)}" ${shirtStyle(player)} aria-hidden="true">
          <span>${escapeHtml(teamInitials(player))}</span>
        </span>
        <span class="player-main">
          <strong>${escapeHtml(player.name)}</strong>
          <span>${escapeHtml([player.team, player.fixture].filter(Boolean).join(" - ") || "Fixture TBC")}</span>
        </span>
        <span class="player-meta">
          <span class="mini-pill">${escapeHtml(player.position)}</span>
          <span class="mini-pill">${escapeHtml(player.price || "Price TBC")}</span>
          <span class="mini-pill ${Number(player.ownership) < 5 ? "green" : ""}">${escapeHtml(ownershipText(player.ownership))}</span>
          ${player.aliases?.length ? `<span class="mini-pill gold">aka ${escapeHtml(player.aliases[0])}</span>` : ""}
          ${target === "squad" && player.status && player.status !== "playing" ? `<span class="mini-pill red">${escapeHtml(player.status)}</span>` : ""}
          <button class="mini-action player-action ${!addState.ok && target === "squad" ? "muted" : ""}" type="button" data-player-action ${disabled ? "disabled" : ""}>${escapeHtml(actionText)}</button>
        </span>
      </article>
    `;
  }

  function renderEmptyResults(container, message) {
    container.innerHTML = `<div class="pool-empty">${escapeHtml(message)}</div>`;
  }

  function handlePlayerResultClick(event) {
    const action = event.target.closest("[data-player-action]");
    if (!action) return;

    const option = action.closest(".player-option");
    if (!option) return;

    const player = getPlayerById(option.dataset.playerId);
    if (!player) return;

    if (option.dataset.target === "squad") {
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

    if (options.autoStart !== false && canStartPlayer(player).ok) {
      state.starterIds.push(player.id);
    }

    ensureCaptaincy();
    if (!options.silent) {
      persistSquad();
      renderSelectedXi();
    }
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
    renderLineupPitch(starters, formation);

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

  function renderDifferentialSpotlight(player = state.selectedDifferential) {
    if (!differentialSpotlight) return;

    if (!player) {
      differentialSpotlight.innerHTML = `
        <div class="spotlight-pitch" aria-hidden="true">
          <span class="spotlight-circle"></span>
          <span class="spotlight-box"></span>
        </div>
        <div class="spotlight-copy">
          <span class="spotlight-kicker">Touchline view</span>
          <h3>Pick a player to light up the pitch.</h3>
          <p>The selected differential appears here with shirt, country, price, ownership, and fixture context.</p>
        </div>
      `;
      return;
    }

    const ownership = ownershipText(player.ownership);
    const isDifferential = Number(player.ownership) < 5;
    differentialSpotlight.innerHTML = `
      <div class="spotlight-pitch" aria-hidden="true">
        <span class="spotlight-circle"></span>
        <span class="spotlight-box"></span>
        <div class="spotlight-player">
          <span class="hero-shirt ${shirtClass(player)}" ${shirtStyle(player)}>
            <span>${escapeHtml(teamInitials(player))}</span>
          </span>
          <span class="spotlight-shadow"></span>
        </div>
      </div>
      <div class="spotlight-copy">
        <span class="spotlight-kicker">${isDifferential ? "Under-5% differential" : "Scout watchlist"}</span>
        <h3>${escapeHtml(player.name)}</h3>
        <p>${escapeHtml([player.team, player.fixture].filter(Boolean).join(" - ") || "Fixture TBC")}</p>
        <div class="spotlight-stats">
          <span>${escapeHtml(player.position)}</span>
          <span>${escapeHtml(player.price || "Price TBC")}</span>
          <span>${escapeHtml(ownership)}</span>
        </div>
      </div>
    `;
  }

  function renderLineupPitch(starters = lineupPlayers(), formation = currentFormation(starters)) {
    if (!lineupPitch) return;

    if (!starters.length) {
      lineupPitch.innerHTML = `<div class="pitch-empty">Add starters to build your XI on the pitch.</div>`;
      return;
    }

    const groups = positionMapToPlayers(starters);
    const rows = ["FWD", "MID", "DEF", "GK"];
    lineupPitch.innerHTML = `
      <div class="pitch-glow" aria-hidden="true"></div>
      <div class="pitch-formation-label">${escapeHtml(formation || "Formation building")}</div>
      ${rows.map((position) => renderPitchRow(position, groups[position])).join("")}
    `;
  }

  function renderPitchRow(position, players) {
    const slots = players.length ? players : [];
    return `
      <div class="pitch-row pitch-row-${position.toLowerCase()}" data-position="${escapeHtml(position)}">
        ${slots.length ? slots.map((player) => renderPitchPlayer(player)).join("") : `<span class="pitch-slot-empty">${escapeHtml(position)}</span>`}
      </div>
    `;
  }

  function renderPitchPlayer(player) {
    const isCaptain = player.id === state.captainId;
    const isVice = player.id === state.viceId;
    const role = isCaptain ? "C" : isVice ? "VC" : "";
    return `
      <button class="pitch-player ${isCaptain ? "is-captain" : ""} ${isVice ? "is-vice" : ""}" type="button" data-captain-player="${escapeHtml(player.id)}" title="Set ${escapeHtml(player.shortName || player.name)} as captain">
        ${role ? `<span class="pitch-role">${role}</span>` : ""}
        <span class="player-shirt pitch-shirt ${shirtClass(player)}" ${shirtStyle(player)} aria-hidden="true">
          <span>${escapeHtml(teamInitials(player))}</span>
        </span>
        <strong>${escapeHtml(player.shortName || shortPlayerName(player.name))}</strong>
        <span>${escapeHtml(player.position)} - ${escapeHtml(player.price || "TBC")}</span>
      </button>
    `;
  }

  function positionMapToPlayers(players) {
    return POSITION_ORDER.reduce((groups, position) => {
      groups[position] = players.filter((player) => player.position === position);
      return groups;
    }, {});
  }

  function loadRandomDifferentialSample() {
    const candidates = state.players
      .filter((player) => sampleEligiblePlayer(player))
      .sort((a, b) => ownershipSortValue(a.ownership) - ownershipSortValue(b.ownership));
    const lowOwned = candidates.filter((player) => ownershipSortValue(player.ownership) <= 8);
    const player = randomChoice(lowOwned.length ? lowOwned : candidates);

    if (!player) {
      fillDifferentialForm(sampleDifferential);
      return;
    }

    fillDifferentialForm({
      ...player,
      context: "Randomized sample from the FIFA fantasy player pool. Add any extra rotation, role, or eye-test notes before analyzing."
    });
  }

  function loadSampleXi() {
    resetSquadDraft();

    if (!buildRandomSampleSquad()) {
      resetSquadDraft();
      fillSquadByRules();
      setRandomStartersFromSquad();
    }

    ensureCaptaincy();
    persistSquad();
    renderSelectedXi();
    renderPlayerResults("squad");
  }

  function buildRandomSampleSquad() {
    if (!state.players.length) return false;

    const rules = getRules();
    const attempts = 160;
    const positionSlots = POSITION_ORDER.flatMap((position) => {
      return Array.from({ length: rules.positionTargets[position] || 0 }, () => position);
    });

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      resetSquadDraft();
      const positionsToFill = shuffle(positionSlots);

      const filled = positionsToFill.every((position) => {
        const candidates = state.players
          .filter((player) => player.position === position)
          .filter((player) => sampleEligiblePlayer(player))
          .filter((player) => playerAddState(player).ok)
          .sort((a, b) => {
            return priceNumber(a.price) - priceNumber(b.price)
              || ownershipSortValue(a.ownership) - ownershipSortValue(b.ownership)
              || String(a.name).localeCompare(String(b.name));
          });
        const poolSize = Math.min(candidates.length, Math.max(8, Math.ceil(candidates.length * 0.28)));
        const candidate = randomChoice(candidates.slice(0, poolSize));
        return candidate ? addPlayerToSquad(candidate, { silent: true, autoStart: false }) : false;
      });

      if (!filled || state.selectedXi.length !== rules.squadSize) continue;

      if (setRandomStartersFromSquad()) return true;
    }

    resetSquadDraft();
    return false;
  }

  function resetSquadDraft() {
    state.selectedXi = [];
    state.starterIds = [];
    state.captainId = "";
    state.viceId = "";
  }

  function setRandomStartersFromSquad() {
    const rules = getRules();
    const formations = shuffle(rules.allowedFormations);

    for (const formation of formations) {
      const [DEF, MID, FWD] = formation.split("-").map(Number);
      const starterTargets = { GK: 1, DEF, MID, FWD };
      const hasEnoughPlayers = POSITION_ORDER.every((position) => {
        return state.selectedXi.filter((player) => player.position === position).length >= (starterTargets[position] || 0);
      });

      if (!hasEnoughPlayers) continue;

      state.starterIds = POSITION_ORDER.flatMap((position) => {
        return shuffle(state.selectedXi.filter((player) => player.position === position))
          .slice(0, starterTargets[position] || 0)
          .map((player) => player.id);
      });

      ensureCaptaincy();
      if (validateLineup().canAnalyze) return true;
    }

    state.starterIds = [];
    state.captainId = "";
    state.viceId = "";
    return false;
  }

  function renderSquadCard(player, isStarter) {
    const isCaptain = player.id === state.captainId;
    const isVice = player.id === state.viceId;
    const startState = canStartPlayer(player);
    const canMoveToStart = isStarter || startState.ok;
    const role = isCaptain ? "Captain" : isVice ? "Vice" : isStarter ? "Starter" : "Bench";

    return `
      <article class="xi-card ${isStarter ? "starter" : "bench"} ${isCaptain ? "captain-card" : ""}">
        <span class="player-shirt ${shirtClass(player)}" ${shirtStyle(player)} aria-hidden="true">
          <span>${escapeHtml(teamInitials(player))}</span>
        </span>
        <div class="xi-card-copy">
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
    state.selectedDifferential = player;
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
    renderDifferentialSpotlight(player);
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

  function ownershipSortValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 100;
  }

  function teamInitials(player) {
    const source = player.teamAbbr || player.team || player.name || "WCF";
    const letters = String(source)
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 3)
      .toUpperCase();
    return letters || "WCF";
  }

  function shortPlayerName(name) {
    const parts = String(name || "Player").trim().split(/\s+/);
    return parts.length > 1 ? parts[parts.length - 1] : parts[0];
  }

  function shirtClass(player) {
    return `kit-${String(player.position || "mid").toLowerCase()}`;
  }

  function shirtStyle(player) {
    const seed = `${player.teamAbbr || ""}${player.team || ""}${player.position || ""}`;
    const hue = hashString(seed) % 360;
    const secondHue = (hue + 42 + (hashString(`${seed}-alt`) % 54)) % 360;
    return `style="--kit-a: hsl(${hue} 86% 46%); --kit-b: hsl(${secondHue} 86% 54%);"`;
  }

  function hashString(value) {
    return String(value || "wcf").split("").reduce((hash, char) => {
      return ((hash << 5) - hash + char.charCodeAt(0)) >>> 0;
    }, 0);
  }

  function sampleEligiblePlayer(player) {
    return !player.isEliminated && !["transferred", "eliminated"].includes(String(player.status || "").toLowerCase());
  }

  function randomChoice(items) {
    if (!Array.isArray(items) || !items.length) return null;
    return items[Math.floor(Math.random() * items.length)];
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function normalizeSearch(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
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

      if (data.model) modelChip.textContent = `Powered by ${friendlyModelName(data.model)}`;
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

  function friendlyModelName(model) {
    const cleaned = String(model || "GitHub Models").replace(/^openai\//i, "");
    if (/^gpt-/i.test(cleaned)) {
      return cleaned
        .replace(/^gpt/i, "GPT")
        .replace(/-mini$/i, " mini");
    }
    return cleaned;
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
