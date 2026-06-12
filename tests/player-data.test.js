const assert = require("assert");
const {
  buildDiagnostics,
  getPlayerData,
  normalizePlayers,
  resetPlayerDataCache
} = require("../lib/player-data");

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

(async () => {
  {
    const raw = [
      { id: 1, name: "Ready One", squadId: "POR", position: 3, price: 7.5, status: "available" },
      { id: 1, name: "Ready One Duplicate", squadId: "POR", position: 3, price: 7.5, status: "available" },
      { id: 2, name: "No Team", position: 2, price: 4.5, status: "available" },
      { id: 3, name: "Bad Position", squadId: "FRA", position: 9, price: 4.5, status: "available" },
      { id: 4, name: "No Price", squadId: "BRA", position: 4, status: "available" },
      { id: 5, name: "Transferred", squadId: "USA", position: 1, price: 4.0, status: "transferred" }
    ];
    const teams = new Map([
      ["POR", { name: "Portugal", abbr: "POR" }],
      ["FRA", { name: "France", abbr: "FRA" }],
      ["BRA", { name: "Brazil", abbr: "BRA" }],
      ["USA", { name: "United States", abbr: "USA" }]
    ]);
    const normalized = normalizePlayers(raw, teams, []);
    const diagnostics = buildDiagnostics(raw, normalized);

    assert.strictEqual(diagnostics.rawRecordCount, 6);
    assert.strictEqual(diagnostics.uniquePlayerIdCount, 5);
    assert.strictEqual(diagnostics.duplicateIdCount, 1);
    assert.strictEqual(diagnostics.missingTeamCount, 1);
    assert.strictEqual(diagnostics.invalidPositionCount, 1);
    assert.strictEqual(diagnostics.missingPriceCount, 1);
    assert.strictEqual(diagnostics.statusBreakdown.available, 5);
    assert.strictEqual(diagnostics.statusBreakdown.transferred, 1);
    assert.strictEqual(diagnostics.selectablePlayerCount, 2);
    assert.strictEqual(diagnostics.unavailableCount, 4);
  }

  await withEnv({ WCF_USE_SAMPLE_DATA: "true" }, async () => {
    resetPlayerDataCache();
    const data = await getPlayerData();
    assert.strictEqual(data.demoData, true);
    assert.strictEqual(data.liveDataAvailable, false);
    assert.strictEqual(data.aiEnabled, false);
    assert(data.warning.includes("demo data"));
  });

  console.log("player data tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
