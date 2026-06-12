const assert = require("assert");
const { validateFantasySquad } = require("../lib/fantasy-squad-rules");

function player(position, index, overrides = {}) {
  return {
    id: `${position}-${index}`,
    name: `${position} ${index}`,
    position,
    team: `Team ${Math.ceil(index / 3)}`,
    price: "$5.0m",
    ...overrides
  };
}

function legalSquad() {
  return [
    player("GK", 1),
    player("GK", 2),
    player("DEF", 3),
    player("DEF", 4),
    player("DEF", 5),
    player("DEF", 6),
    player("DEF", 7),
    player("MID", 8),
    player("MID", 9),
    player("MID", 10),
    player("MID", 11),
    player("MID", 12),
    player("FWD", 13),
    player("FWD", 14),
    player("FWD", 15)
  ];
}

{
  const result = validateFantasySquad(legalSquad());
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.totalCost, 75);
}

{
  const result = validateFantasySquad(legalSquad().slice(0, 14));
  assert(result.issues.some((issue) => issue.code === "SQUAD_SIZE"));
}

{
  const squad = legalSquad().map((item) => ({ ...item, price: "$8.0m" }));
  const result = validateFantasySquad(squad);
  assert(result.issues.some((issue) => issue.code === "BUDGET"));
}

{
  const squad = legalSquad();
  squad[0].team = "Portugal";
  squad[1].team = "Portugal";
  squad[2].team = "Portugal";
  squad[3].team = "Portugal";
  const result = validateFantasySquad(squad);
  assert(result.issues.some((issue) => issue.code === "TEAM_CAP"));
}

{
  const squad = legalSquad();
  squad[14] = player("MID", 16);
  const result = validateFantasySquad(squad);
  assert(result.issues.some((issue) => issue.code === "POSITION_COUNT"));
}

console.log("squad rules tests passed");
