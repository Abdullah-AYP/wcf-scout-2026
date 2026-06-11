const fs = require("fs");
const path = require("path");

const SAMPLE_PATH = path.join(__dirname, "..", "data", "sample-players.json");
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

  const remoteBaseUrl = process.env.WCF_DATA_BASE_URL;
  if (remoteBaseUrl) {
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

  const sample = loadSampleData();
  cache = { loadedAt: Date.now(), payload: sample };
  return sample;
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

  return {
    source: "remote",
    sourceLabel: cleanBase,
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
      headers: { "Accept": "application/json" },
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
    squads.map((squad) => [
      String(squad.id ?? squad.squadId ?? squad.feedId ?? squad.abbr),
      squad.name || squad.shortName || squad.abbr || "Unknown"
    ])
  );
}

function normalizePlayers(players, teamsById, rounds) {
  return players.map((player) => {
    const stats = player.stats || {};
    const teamId = player.squadId ?? player.teamId ?? player.countryId ?? "";
    const team = teamsById.get(String(teamId)) || player.team || player.squadName || player.country || "";
    const ownership = numberOrEmpty(stats.pickedBy ?? stats.percentSelected ?? player.percentSelected ?? player.ownership);
    const price = formatPrice(player.price ?? player.cost ?? player.value);

    return {
      id: String(player.id ?? player.feedId ?? player.optaId ?? player.name),
      name: player.name || [player.firstName, player.lastName].filter(Boolean).join(" ") || player.shortName || "Unknown player",
      shortName: player.shortName || player.preferredName || player.lastName || player.name || "Unknown",
      team,
      teamId: String(teamId || team),
      position: POSITION_MAP[player.position] || POSITION_MAP[player.positionName] || player.positionName || "MID",
      price,
      ownership,
      fixture: player.nextFixture || stats.nextFixtureFromScheduledRound || nextFixture(teamId, rounds),
      form: formatForm(stats, player.status),
      totalPoints: numberOrEmpty(stats.totalPoints ?? player.totalPoints),
      status: player.status || "unknown"
    };
  });
}

function nextFixture(teamId, rounds) {
  if (!teamId || !Array.isArray(rounds)) return "";
  const round = rounds.find((item) => ["active", "scheduled"].includes(item.status));
  const match = round?.tournaments?.find((item) => String(item.homeSquadId) === String(teamId) || String(item.awaySquadId) === String(teamId));
  if (!match) return "";
  const opponent = String(match.homeSquadId) === String(teamId) ? match.awaySquadName : match.homeSquadName;
  return opponent ? `vs ${opponent}` : "";
}

function formatForm(stats, status) {
  const parts = [];
  if (typeof stats.totalPoints === "number") parts.push(`${stats.totalPoints} total points`);
  if (typeof stats.avgPoints === "number") parts.push(`${stats.avgPoints} avg points`);
  if (typeof stats.goals === "number" && stats.goals > 0) parts.push(`${stats.goals} goals`);
  if (typeof stats.assists === "number" && stats.assists > 0) parts.push(`${stats.assists} assists`);
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

module.exports = {
  getPlayerData
};
