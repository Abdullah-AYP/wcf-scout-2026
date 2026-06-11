const fs = require("fs");
const path = require("path");

const SAMPLE_PATH = path.join(__dirname, "..", "data", "sample-players.json");
const OFFICIAL_FANTASY_BASE_URL = "https://play.fifa.com/json/fantasy/";
const DEFAULT_TIMEOUT_MS = 6500;
const POSITION_MAP = {
  1: "GK",
  2: "DEF",
  3: "MID",
  4: "FWD",
  GK: "GK",
  DEF: "DEF",
  MID: "MID",
  FWD: "FWD"
};

let cache = null;

async function getPlayerData() {
  if (cache && Date.now() - cache.loadedAt < 5 * 60 * 1000) {
    return cache.payload;
  }

  if (process.env.WCF_USE_SAMPLE_DATA === "true") {
    const sample = loadSampleData();
    cache = { loadedAt: Date.now(), payload: sample };
    return sample;
  }

  const remoteBaseUrl = process.env.WCF_DATA_BASE_URL || OFFICIAL_FANTASY_BASE_URL;

  try {
    const remote = await loadRemoteData(remoteBaseUrl);
    cache = { loadedAt: Date.now(), payload: remote };
    return remote;
  } catch (error) {
    const sample = loadSampleData(error.message);
    cache = { loadedAt: Date.now(), payload: sample };
    return sample;
  }
}

async function loadRemoteData(baseUrl) {
  const cleanBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const [players, squads, rounds] = await Promise.all([
    fetchJson(`${cleanBase}players.json`),
    fetchJson(`${cleanBase}squads.json`).catch(() => []),
    fetchJson(`${cleanBase}rounds.json`).catch(() => [])
  ]);

  if (!Array.isArray(players) || players.length === 0) {
    throw new Error("Remote player data did not contain a player array.");
  }

  if (isClearlyStale(rounds, players) && process.env.WCF_ALLOW_STALE_DATA !== "true") {
    throw new Error("Remote FIFA data looked stale, so sample data was used instead.");
  }

  const teamsById = mapTeams(squads);
  const normalizedPlayers = normalizePlayers(players, teamsById, rounds);
  const officialSource = isOfficialBaseUrl(cleanBase);

  return {
    source: officialSource ? "official" : "remote",
    sourceLabel: officialSource ? "FIFA World Cup Fantasy 2026" : cleanBase,
    stale: false,
    loadedAt: new Date().toISOString(),
    players: normalizedPlayers,
    teams: [...new Set(normalizedPlayers.map((player) => player.team).filter(Boolean))].sort()
  };
}

function loadSampleData(warning) {
  const players = JSON.parse(fs.readFileSync(SAMPLE_PATH, "utf8"));
  return {
    source: "sample",
    sourceLabel: "Sample development data",
    warning,
    stale: false,
    loadedAt: new Date().toISOString(),
    players,
    teams: [...new Set(players.map((player) => player.team).filter(Boolean))].sort()
  };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "User-Agent": "WCF Scout 2026 (+https://wcfscout.app)"
      },
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`Could not fetch ${url}: ${response.status}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function mapTeams(squads) {
  if (!Array.isArray(squads)) return new Map();
  return new Map(
    squads.map((squad) => {
      const id = String(squad.id ?? squad.squadId ?? squad.feedId ?? squad.abbr);
      return [
        id,
        {
          id,
          name: squad.name || squad.shortName || squad.abbr || "Unknown",
          abbr: squad.abbr || squad.shortName || "",
          group: squad.group || "",
          isEliminated: Boolean(squad.isEliminated)
        }
      ];
    })
  );
}

function normalizePlayers(players, teamsById, rounds) {
  return players.map((player) => {
    const stats = player.stats || {};
    const teamId = player.squadId ?? player.teamId ?? player.countryId ?? "";
    const teamRecord = teamsById.get(String(teamId));
    const team = teamRecord?.name || player.team || player.squadName || player.country || "";
    const ownership = numberOrEmpty(stats.pickedBy ?? stats.percentSelected ?? player.percentSelected ?? player.ownership);
    const price = formatPrice(player.price ?? player.cost ?? player.value);
    const nextFixtureId = stats.nextFixtureFromActiveRound
      ?? stats.nextFixtureFromScheduledRound
      ?? player.nextFixtureFromActiveRound
      ?? player.nextFixtureFromScheduledRound
      ?? player.nextFixtureId;

    return {
      id: String(player.id ?? player.feedId ?? player.optaId ?? player.name),
      name: player.name || [player.firstName, player.lastName].filter(Boolean).join(" ") || player.shortName || "Unknown player",
      shortName: player.shortName || player.preferredName || player.lastName || player.name || "Unknown",
      team,
      teamAbbr: teamRecord?.abbr || player.teamAbbr || "",
      teamId: String(teamId || team),
      group: teamRecord?.group || player.group || "",
      position: POSITION_MAP[player.position] || POSITION_MAP[player.positionName] || player.positionName || "MID",
      price,
      rawPrice: numberOrEmpty(player.price ?? player.cost ?? player.value),
      ownership,
      fixture: player.nextFixture || player.fixture || nextFixture(teamId, rounds, teamsById, nextFixtureId),
      nextFixtureId: nextFixtureId ? String(nextFixtureId) : "",
      form: formatForm(stats, player.status, player),
      totalPoints: numberOrEmpty(stats.totalPoints ?? player.totalPoints),
      avgPoints: numberOrEmpty(stats.avgPoints ?? player.avgPoints),
      lastRoundPoints: numberOrEmpty(stats.lastRoundPoints ?? player.lastRoundPoints),
      matchStatus: player.matchStatus || "",
      oneToWatch: Boolean(player.oneToWatch),
      isEliminated: Boolean(teamRecord?.isEliminated),
      status: player.status || "unknown"
    };
  });
}

function nextFixture(teamId, rounds, teamsById, preferredMatchId) {
  if (!teamId || !Array.isArray(rounds)) return "";
  const matches = rounds
    .flatMap((round) => Array.isArray(round.tournaments)
      ? round.tournaments.map((match) => ({ ...match, roundStatus: round.status }))
      : [])
    .filter((match) => matchHasTeam(match, teamId))
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));

  const preferredMatch = preferredMatchId
    ? matches.find((match) => String(match.id) === String(preferredMatchId))
    : null;
  const match = preferredMatch || matches.find((item) => isUpcomingFixture(item)) || matches[0];

  if (!match) return "";
  const isHome = String(match.homeSquadId) === String(teamId);
  const opponentId = isHome ? match.awaySquadId : match.homeSquadId;
  const opponent = isHome
    ? match.awaySquadAbbr || match.awaySquadName || squadLabel(opponentId, teamsById)
    : match.homeSquadAbbr || match.homeSquadName || squadLabel(opponentId, teamsById);
  const dateLabel = formatFixtureDate(match.date);
  return [opponent ? `vs ${opponent}` : "", dateLabel].filter(Boolean).join(" - ");
}

function matchHasTeam(match, teamId) {
  return String(match.homeSquadId) === String(teamId) || String(match.awaySquadId) === String(teamId);
}

function isUpcomingFixture(match) {
  const status = String(match.status || match.period || match.roundStatus || "").toLowerCase();
  return !["finished", "complete", "completed", "full_time", "ft", "closed"].includes(status);
}

function squadLabel(squadId, teamsById) {
  const squad = teamsById.get(String(squadId));
  return squad?.abbr || squad?.name || "";
}

function formatFixtureDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function formatForm(stats, status, player) {
  const parts = [];
  if (typeof stats.totalPoints === "number" && stats.totalPoints > 0) parts.push(`${stats.totalPoints} total points`);
  if (typeof stats.avgPoints === "number" && stats.avgPoints > 0) parts.push(`${stats.avgPoints} avg points`);
  if (typeof stats.form === "number" && stats.form > 0) parts.push(`${stats.form} form`);
  if (typeof stats.lastRoundPoints === "number" && stats.lastRoundPoints > 0) parts.push(`${stats.lastRoundPoints} last round`);
  if (typeof stats.goals === "number" && stats.goals > 0) parts.push(`${stats.goals} goals`);
  if (typeof stats.assists === "number" && stats.assists > 0) parts.push(`${stats.assists} assists`);
  if (player?.oneToWatch) parts.push("one to watch");
  if (player?.matchStatus) parts.push(`match status: ${player.matchStatus}`);
  if (status && status !== "playing") parts.push(`status: ${status}`);
  return parts.join(", ");
}

function formatPrice(value) {
  if (value === undefined || value === null || value === "") return "";
  if (typeof value === "string") return value.startsWith("$") ? value : `$${value}`;
  const normalized = value > 30 ? value / 10 : value;
  return `$${normalized.toFixed(1)}m`;
}

function numberOrEmpty(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(1)) : "";
}

function isClearlyStale(rounds, players) {
  const firstRoundDate = Array.isArray(rounds) ? rounds.find((round) => round.startDate)?.startDate : "";
  const year = firstRoundDate ? new Date(firstRoundDate).getUTCFullYear() : null;
  const firstName = String(players[0]?.name || "");
  return (year && year < 2026) || /Vanina Correa/i.test(firstName);
}

function isOfficialBaseUrl(baseUrl) {
  return baseUrl === OFFICIAL_FANTASY_BASE_URL;
}

module.exports = {
  getPlayerData
};
