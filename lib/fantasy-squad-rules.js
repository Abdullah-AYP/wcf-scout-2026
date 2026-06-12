const DEFAULT_RULES = {
  budget: 100,
  maxPerTeam: 3,
  squadSize: 15,
  positionTargets: {
    GK: 2,
    DEF: 5,
    MID: 5,
    FWD: 3
  }
};

function validateFantasySquad(players, rules = DEFAULT_RULES) {
  const squad = Array.isArray(players) ? players : [];
  const mergedRules = {
    ...DEFAULT_RULES,
    ...rules,
    positionTargets: {
      ...DEFAULT_RULES.positionTargets,
      ...(rules.positionTargets || {})
    }
  };
  const issues = [];

  if (squad.length !== mergedRules.squadSize) {
    issues.push({
      code: "SQUAD_SIZE",
      message: `Squad must contain exactly ${mergedRules.squadSize} players.`
    });
  }

  const totalCost = squad.reduce((sum, player) => sum + numericPrice(player.price ?? player.rawPrice), 0);
  if (totalCost > mergedRules.budget) {
    issues.push({
      code: "BUDGET",
      message: `Squad costs $${totalCost.toFixed(1)}m, above the $${mergedRules.budget.toFixed(1)}m budget.`
    });
  }

  const teams = countBy(squad, (player) => player.team || player.teamId || "Unknown");
  Object.entries(teams).forEach(([team, count]) => {
    if (count > mergedRules.maxPerTeam) {
      issues.push({
        code: "TEAM_CAP",
        message: `${team} has ${count} players, above the ${mergedRules.maxPerTeam} player limit.`
      });
    }
  });

  const positions = countBy(squad, (player) => player.position || "Unknown");
  Object.entries(mergedRules.positionTargets).forEach(([position, target]) => {
    if ((positions[position] || 0) !== target) {
      issues.push({
        code: "POSITION_COUNT",
        message: `${position} must have ${target} players.`
      });
    }
  });

  return {
    valid: issues.length === 0,
    issues,
    totalCost: Number(totalCost.toFixed(1)),
    counts: {
      teams,
      positions
    }
  };
}

function countBy(items, keyFn) {
  return items.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function numericPrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value || "").match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

module.exports = {
  DEFAULT_RULES,
  validateFantasySquad
};
