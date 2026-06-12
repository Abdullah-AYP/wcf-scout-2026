const crypto = require("crypto");

const MAX_ANALYZE_BODY_BYTES = 20_000;
const ANALYZE_WINDOW_MS = 10 * 60_000;
const ANALYZE_MAX_PER_WINDOW = 5;
const MAX_CONTEXT_CHARS = 700;
const MAX_FORM_CHARS = 700;
const MAX_PLAYER_TEXT_CHARS = 120;
const VALID_TOOLS = new Set(["differential", "captaincy"]);
const VALID_POSITIONS = new Set(["GK", "DEF", "MID", "FWD"]);
const VALID_ROLES = new Set(["captain", "vice captain", "starter", "bench", ""]);

const rateLimitStore = new Map();

async function prepareAnalyzeRequest(req, input, options = {}) {
  assertBodySize(req, input);
  await enforceAnalyzeRateLimit(req, options.now, options);
  return validateAnalyzeBody(parseAnalyzeBody(input));
}

function parseAnalyzeBody(input) {
  if (typeof input === "string") {
    try {
      return JSON.parse(input || "{}");
    } catch (error) {
      throw publicError(400, "BAD_JSON", "That request was not valid JSON.");
    }
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw publicError(400, "BAD_REQUEST", "Send a JSON object with a tool and payload.");
  }

  return input;
}

function validateAnalyzeBody(body) {
  const tool = cleanText(body.tool, 32);
  if (!VALID_TOOLS.has(tool)) {
    throw publicError(400, "BAD_TOOL", "Choose either the differential scout or captaincy optimizer.");
  }

  return {
    tool,
    payload: tool === "differential"
      ? sanitizeDifferentialPayload(body.payload)
      : sanitizeCaptaincyPayload(body.payload)
  };
}

function sanitizeDifferentialPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw publicError(400, "BAD_PAYLOAD", "Pick a player before running the differential scout.");
  }

  const name = cleanText(payload.name, MAX_PLAYER_TEXT_CHARS);
  const position = cleanText(payload.position, 8);
  const ownership = numberInRange(payload.ownership, 0, 100, "Ownership must be between 0 and 100.");

  if (name.length < 2) {
    throw publicError(400, "BAD_PLAYER", "Player name is required.");
  }
  if (!VALID_POSITIONS.has(position)) {
    throw publicError(400, "BAD_POSITION", "Player position must be GK, DEF, MID, or FWD.");
  }

  return {
    name,
    officialName: cleanText(payload.officialName, MAX_PLAYER_TEXT_CHARS),
    position,
    ownership,
    price: cleanText(payload.price, 24),
    team: cleanText(payload.team, 80),
    fixture: cleanText(payload.fixture, 100),
    form: cleanText(payload.form, MAX_FORM_CHARS),
    context: cleanText(payload.context, MAX_CONTEXT_CHARS)
  };
}

function sanitizeCaptaincyPayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw publicError(400, "BAD_PAYLOAD", "Build a starting XI before optimizing captaincy.");
  }

  if (!Array.isArray(payload.players) || payload.players.length !== 11) {
    throw publicError(400, "BAD_LINEUP", "Captaincy optimizer needs exactly 11 starters.");
  }

  const players = payload.players.map((player, index) => sanitizeCaptaincyPlayer(player, index, "starter"));
  const captain = payload.captain ? sanitizeCaptaincyPlayer(payload.captain, 0, "captain") : null;
  const viceCaptain = payload.viceCaptain ? sanitizeCaptaincyPlayer(payload.viceCaptain, 0, "vice captain") : null;
  const bench = Array.isArray(payload.bench)
    ? payload.bench.slice(0, 4).map((player, index) => sanitizeCaptaincyPlayer(player, index, "bench"))
    : [];

  return {
    players,
    captain,
    viceCaptain,
    bench,
    squadSummary: sanitizeSquadSummary(payload.squadSummary),
    context: cleanText(payload.context, MAX_CONTEXT_CHARS)
  };
}

function sanitizeCaptaincyPlayer(player, index, fallbackRole) {
  if (!player || typeof player !== "object" || Array.isArray(player)) {
    throw publicError(400, "BAD_PLAYER", `Player ${index + 1} is missing.`);
  }

  const name = cleanText(player.name || player.displayName, MAX_PLAYER_TEXT_CHARS);
  const position = cleanText(player.position, 8);
  const role = cleanText(player.role || fallbackRole, 24);

  if (name.length < 2) {
    throw publicError(400, "BAD_PLAYER", `Player ${index + 1} needs a name.`);
  }
  if (!VALID_POSITIONS.has(position)) {
    throw publicError(400, "BAD_POSITION", `${name} has an invalid position.`);
  }
  if (!VALID_ROLES.has(role)) {
    throw publicError(400, "BAD_ROLE", `${name} has an invalid squad role.`);
  }

  return {
    name,
    officialName: cleanText(player.officialName, MAX_PLAYER_TEXT_CHARS),
    position,
    role,
    team: cleanText(player.team, 80),
    fixture: cleanText(player.fixture, 100),
    price: cleanText(player.price, 24),
    ownership: optionalNumberInRange(player.ownership, 0, 100),
    form: cleanText(player.form, 280),
    totalPoints: optionalNumberInRange(player.totalPoints, 0, 500),
    avgPoints: optionalNumberInRange(player.avgPoints, 0, 50),
    lastRoundPoints: optionalNumberInRange(player.lastRoundPoints, -20, 50),
    matchStatus: cleanText(player.matchStatus, 40),
    oneToWatch: Boolean(player.oneToWatch)
  };
}

function sanitizeSquadSummary(summary) {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return {};
  return {
    cost: cleanText(summary.cost, 24),
    budget: cleanText(summary.budget, 24),
    formation: cleanText(summary.formation, 16),
    squadSize: optionalNumberInRange(summary.squadSize, 0, 30),
    starters: optionalNumberInRange(summary.starters, 0, 15),
    maxPerTeam: optionalNumberInRange(summary.maxPerTeam, 0, 15)
  };
}

function assertBodySize(req, input) {
  const headerSize = Number(req?.headers?.["content-length"] || req?.headers?.["Content-Length"]);
  if (Number.isFinite(headerSize) && headerSize > MAX_ANALYZE_BODY_BYTES) {
    throw publicError(413, "BODY_TOO_LARGE", "That request is too large. Shorten the notes and try again.");
  }

  const estimatedSize = typeof input === "string"
    ? Buffer.byteLength(input)
    : Buffer.byteLength(JSON.stringify(input || {}));

  if (estimatedSize > MAX_ANALYZE_BODY_BYTES) {
    throw publicError(413, "BODY_TOO_LARGE", "That request is too large. Shorten the notes and try again.");
  }
}

async function enforceAnalyzeRateLimit(req, now = Date.now(), options = {}) {
  if (process.env.WCF_DISABLE_RATE_LIMIT === "true") return;

  const ip = clientIp(req);
  const persistentStore = rateLimitStoreConfig();

  if (persistentStore) {
    await enforcePersistentRateLimit(persistentStore, ip, now, options.fetch);
    return;
  }

  if (isProductionRuntime()) {
    throw publicError(
      503,
      "RATE_LIMIT_STORE_MISSING",
      "AI scouting is temporarily unavailable while persistent rate limiting is being configured."
    );
  }

  enforceMemoryRateLimit(ip, now);
}

async function enforcePersistentRateLimit(config, ip, now = Date.now(), fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") {
    throw publicError(503, "RATE_LIMIT_STORE_UNAVAILABLE", "AI scouting is temporarily unavailable. Please try again soon.");
  }

  const windowId = Math.floor(now / ANALYZE_WINDOW_MS);
  const retryAfter = Math.max(1, Math.ceil(((windowId + 1) * ANALYZE_WINDOW_MS - now) / 1000));
  const key = `wcf:analyze:${hashIp(ip)}:${windowId}`;
  const count = Number(await redisCommand(config, ["INCR", key], fetchImpl));

  if (!Number.isFinite(count)) {
    throw publicError(503, "RATE_LIMIT_STORE_UNAVAILABLE", "AI scouting is temporarily unavailable. Please try again soon.");
  }

  if (count === 1) {
    await redisCommand(config, ["EXPIRE", key, Math.ceil(ANALYZE_WINDOW_MS / 1000) + 60], fetchImpl);
  }

  if (count > ANALYZE_MAX_PER_WINDOW) {
    throw publicError(
      429,
      "RATE_LIMITED",
      `This connection has used its 5 AI reports for the next 10 minutes. Try again in ${retryAfter} seconds.`,
      retryAfter
    );
  }
}

async function redisCommand(config, command, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(command)
    });
  } catch (error) {
    throw publicError(503, "RATE_LIMIT_STORE_UNAVAILABLE", "AI scouting is temporarily unavailable. Please try again soon.");
  }

  if (!response.ok) {
    throw publicError(503, "RATE_LIMIT_STORE_UNAVAILABLE", "AI scouting is temporarily unavailable. Please try again soon.");
  }

  const body = await response.json().catch(() => ({}));
  if (body.error) {
    throw publicError(503, "RATE_LIMIT_STORE_UNAVAILABLE", "AI scouting is temporarily unavailable. Please try again soon.");
  }
  return body.result;
}

function enforceMemoryRateLimit(ip, now = Date.now()) {
  const entry = rateLimitStore.get(ip) || { windowId: null, count: 0 };
  const windowId = Math.floor(now / ANALYZE_WINDOW_MS);

  if (entry.windowId !== windowId) {
    entry.windowId = windowId;
    entry.count = 0;
  }

  entry.count += 1;
  rateLimitStore.set(ip, entry);

  if (entry.count > ANALYZE_MAX_PER_WINDOW) {
    const retryAfter = Math.max(1, Math.ceil(((windowId + 1) * ANALYZE_WINDOW_MS - now) / 1000));
    throw publicError(
      429,
      "RATE_LIMITED",
      `This connection has used its 5 AI reports for the next 10 minutes. Try again in ${retryAfter} seconds.`,
      retryAfter
    );
  }

  pruneRateLimitStore(now);
}

function clientIp(req) {
  const forwarded = req?.headers?.["x-forwarded-for"] || req?.headers?.["X-Forwarded-For"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return req?.socket?.remoteAddress || req?.connection?.remoteAddress || "unknown";
}

function pruneRateLimitStore(now) {
  if (rateLimitStore.size < 1000) return;
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (entry.windowId < Math.floor(now / ANALYZE_WINDOW_MS) - 1) rateLimitStore.delete(ip);
  }
}

function rateLimitStoreConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function hashIp(ip) {
  return crypto.createHash("sha256").update(String(ip || "unknown")).digest("hex").slice(0, 32);
}

function serializeApiError(error) {
  const statusCode = error.statusCode || 500;
  return {
    statusCode,
    headers: error.retryAfter ? { "Retry-After": String(error.retryAfter) } : {},
    body: {
      error: error.publicMessage || error.message || "Unexpected server error.",
      code: error.code || "SERVER_ERROR",
      retryAfter: error.retryAfter || undefined
    }
  };
}

function publicError(statusCode, code, message, retryAfter) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.publicMessage = message;
  if (retryAfter) error.retryAfter = retryAfter;
  return error;
}

function cleanText(value, maxLength) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function numberInRange(value, min, max, message) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw publicError(400, "BAD_NUMBER", message);
  }
  return Number(number.toFixed(1));
}

function optionalNumberInRange(value, min, max) {
  if (value === undefined || value === null || value === "") return "";
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? Number(number.toFixed(1)) : "";
}

function resetAnalyzeRateLimit() {
  rateLimitStore.clear();
}

module.exports = {
  MAX_ANALYZE_BODY_BYTES,
  prepareAnalyzeRequest,
  parseAnalyzeBody,
  validateAnalyzeBody,
  enforceAnalyzeRateLimit,
  serializeApiError,
  resetAnalyzeRateLimit
};
