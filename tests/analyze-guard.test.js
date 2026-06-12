const assert = require("assert");
const {
  MAX_ANALYZE_BODY_BYTES,
  prepareAnalyzeRequest,
  resetAnalyzeRateLimit
} = require("../lib/analyze-guard");

function req(ip = "203.0.113.10", headers = {}) {
  return {
    headers: {
      "x-forwarded-for": ip,
      ...headers
    },
    socket: {
      remoteAddress: ip
    }
  };
}

function validDifferential(overrides = {}) {
  return {
    tool: "differential",
    payload: {
      name: "Vitinha",
      position: "MID",
      ownership: 4.2,
      price: "$7.5m",
      team: "Portugal",
      fixture: "vs USA",
      form: "Starts regularly.",
      context: "Creative midfield role.",
      ...overrides
    }
  };
}

function validCaptaincy(overrides = {}) {
  const positions = ["GK", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "FWD", "FWD"];
  return {
    tool: "captaincy",
    payload: {
      players: positions.map((position, index) => ({
        name: `Player ${index + 1}`,
        position,
        team: index < 3 ? "Portugal" : "France",
        fixture: "vs USA",
        price: "$5.0m",
        ownership: 5,
        role: index === 0 ? "captain" : index === 1 ? "vice captain" : "starter"
      })),
      context: "Matchday test.",
      ...overrides
    }
  };
}

function expectError(fn, statusCode, code) {
  assert.throws(fn, (error) => {
    assert.strictEqual(error.statusCode, statusCode);
    if (code) assert.strictEqual(error.code, code);
    return true;
  });
}

resetAnalyzeRateLimit();

{
  const request = prepareAnalyzeRequest(req("203.0.113.1"), validDifferential({
    context: "x".repeat(1200),
    extraField: "removed"
  }), { now: 1_000 });

  assert.strictEqual(request.tool, "differential");
  assert.strictEqual(request.payload.name, "Vitinha");
  assert.strictEqual(request.payload.context.length, 700);
  assert.strictEqual(request.payload.extraField, undefined);
}

resetAnalyzeRateLimit();

expectError(
  () => prepareAnalyzeRequest(req("203.0.113.2"), { tool: "differential", payload: { name: "A", position: "MID", ownership: 4 } }, { now: 1_000 }),
  400,
  "BAD_PLAYER"
);

resetAnalyzeRateLimit();

expectError(
  () => prepareAnalyzeRequest(req("203.0.113.3"), { tool: "captaincy", payload: { players: [{ name: "One", position: "MID" }] } }, { now: 1_000 }),
  400,
  "BAD_LINEUP"
);

resetAnalyzeRateLimit();

{
  const request = prepareAnalyzeRequest(req("203.0.113.4"), validCaptaincy(), { now: 1_000 });
  assert.strictEqual(request.tool, "captaincy");
  assert.strictEqual(request.payload.players.length, 11);
  assert.strictEqual(request.payload.players[0].role, "captain");
}

resetAnalyzeRateLimit();

{
  prepareAnalyzeRequest(req("203.0.113.5"), validDifferential(), { now: 1_000 });
  expectError(
    () => prepareAnalyzeRequest(req("203.0.113.5"), validDifferential(), { now: 2_000 }),
    429,
    "COOLDOWN"
  );
}

resetAnalyzeRateLimit();

expectError(
  () => prepareAnalyzeRequest(
    req("203.0.113.6", { "content-length": String(MAX_ANALYZE_BODY_BYTES + 1) }),
    validDifferential(),
    { now: 1_000 }
  ),
  413,
  "BODY_TOO_LARGE"
);

console.log("analyze guard tests passed");
