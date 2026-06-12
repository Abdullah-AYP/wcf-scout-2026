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

async function expectError(fn, statusCode, code) {
  let thrown = null;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }
  assert(thrown, `Expected ${code || statusCode} error`);
  assert.strictEqual(thrown.statusCode, statusCode);
  if (code) assert.strictEqual(thrown.code, code);
  return thrown;
}

function withEnv(env, fn) {
  const previous = {};
  Object.keys(env).forEach((key) => {
    previous[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  });

  return Promise.resolve(fn()).finally(() => {
    Object.keys(env).forEach((key) => {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    });
  });
}

function mockRedisFetch() {
  const store = new Map();
  return async (url, options) => {
    assert.strictEqual(url, "https://redis.example");
    assert.strictEqual(options.headers.Authorization, "Bearer test-token");
    const command = JSON.parse(options.body);
    let result = "OK";

    if (command[0] === "INCR") {
      const next = (store.get(command[1]) || 0) + 1;
      store.set(command[1], next);
      result = next;
    }

    return {
      ok: true,
      async json() {
        return { result };
      }
    };
  };
}

(async () => {
  resetAnalyzeRateLimit();

  {
    const request = await prepareAnalyzeRequest(req("203.0.113.1"), validDifferential({
      context: "x".repeat(1200),
      extraField: "removed"
    }), { now: 1_000 });

    assert.strictEqual(request.tool, "differential");
    assert.strictEqual(request.payload.name, "Vitinha");
    assert.strictEqual(request.payload.context.length, 700);
    assert.strictEqual(request.payload.extraField, undefined);
  }

  resetAnalyzeRateLimit();

  await expectError(
    () => prepareAnalyzeRequest(req("203.0.113.2"), { tool: "differential", payload: { name: "A", position: "MID", ownership: 4 } }, { now: 1_000 }),
    400,
    "BAD_PLAYER"
  );

  resetAnalyzeRateLimit();

  await expectError(
    () => prepareAnalyzeRequest(req("203.0.113.3"), { tool: "captaincy", payload: { players: [{ name: "One", position: "MID" }] } }, { now: 1_000 }),
    400,
    "BAD_LINEUP"
  );

  resetAnalyzeRateLimit();

  {
    const request = await prepareAnalyzeRequest(req("203.0.113.4"), validCaptaincy(), { now: 1_000 });
    assert.strictEqual(request.tool, "captaincy");
    assert.strictEqual(request.payload.players.length, 11);
    assert.strictEqual(request.payload.players[0].role, "captain");
  }

  resetAnalyzeRateLimit();

  {
    for (let index = 0; index < 5; index += 1) {
      await prepareAnalyzeRequest(req("203.0.113.5"), validDifferential(), { now: 1_000 + index });
    }
    await expectError(
      () => prepareAnalyzeRequest(req("203.0.113.5"), validDifferential(), { now: 2_000 }),
      429,
      "RATE_LIMITED"
    );
  }

  resetAnalyzeRateLimit();

  await expectError(
    () => prepareAnalyzeRequest(
      req("203.0.113.6", { "content-length": String(MAX_ANALYZE_BODY_BYTES + 1) }),
      validDifferential(),
      { now: 1_000 }
    ),
    413,
    "BODY_TOO_LARGE"
  );

  resetAnalyzeRateLimit();

  await withEnv({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
    KV_REST_API_URL: undefined,
    KV_REST_API_TOKEN: undefined
  }, async () => {
    await expectError(
      () => prepareAnalyzeRequest(req("203.0.113.7"), validDifferential(), { now: 1_000 }),
      503,
      "RATE_LIMIT_STORE_MISSING"
    );
  });

  await withEnv({
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    UPSTASH_REDIS_REST_URL: "https://redis.example",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
    KV_REST_API_URL: undefined,
    KV_REST_API_TOKEN: undefined
  }, async () => {
    const fetch = mockRedisFetch();
    for (let index = 0; index < 5; index += 1) {
      await prepareAnalyzeRequest(req("203.0.113.8"), validDifferential(), { now: 1_000 + index, fetch });
    }
    const error = await expectError(
      () => prepareAnalyzeRequest(req("203.0.113.8"), validDifferential(), { now: 2_000, fetch }),
      429,
      "RATE_LIMITED"
    );
    assert(error.retryAfter > 0);
  });

  console.log("analyze guard tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
