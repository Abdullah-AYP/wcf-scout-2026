const ENDPOINT = "https://models.github.ai/inference/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4.1";

const scoringRules = `
WCF 2026 scoring rules:
- Goal: GK 6, DEF 6, MID 5, FWD 4
- Outside box goal bonus: +1
- Assist: +3
- Clean sheet, 60+ mins: GK 4, DEF 4, MID 1, FWD 0
- Playing 60+ mins: +2
- Playing 1-59 mins: +1
- Goalkeeper saves: +1 per 3 saves
- Chances created: +1 per 2
- Shots on target: DEF/MID/FWD +1 per 3
- Tackles won: MID +1 per 3
- Balls recovered: +1 per 3
- Player of the Match: +2
- Yellow card: -1
- Red card: -3
- Own goal: -2
- Missed penalty: -2
- Scouting Bonus: +2 if ownership is under 5% and the player scores 4+ points in a single match
- Captain score: 2x total round points. Vice-captain doubles only if captain does not play and no manual live-round change is made.
`;

function getModel() {
  return process.env.GITHUB_MODELS_MODEL || DEFAULT_MODEL;
}

async function analyzeWcfRequest({ tool, payload }) {
  if (!["differential", "captaincy"].includes(tool)) {
    const error = new Error("Unsupported tool.");
    error.statusCode = 400;
    throw error;
  }

  const token = process.env.GITHUB_MODELS_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) {
    const error = new Error("Missing GITHUB_MODELS_TOKEN. Add a GitHub PAT with models access to your environment.");
    error.statusCode = 500;
    throw error;
  }

  const messages = [
    { role: "system", content: buildSystemPrompt(tool) },
    { role: "user", content: buildUserPrompt(tool, payload) }
  ];

  let model = getModel();
  let { response, data } = await requestModel({ token, messages, model });

  if (!response.ok && shouldRetryWithDefaultModel(response, data, model)) {
    model = DEFAULT_MODEL;
    ({ response, data } = await requestModel({ token, messages, model }));
  }

  if (!response.ok) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const message = providerLimitMessage(response.status, data)
      || authErrorMessage(response.status)
      || modelErrorMessage(data)
      || `GitHub Models request failed with ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status === 401 || response.status === 403 ? 503 : response.status;
    error.code = response.status === 429 ? "MODEL_QUOTA_LIMIT" : "MODEL_REQUEST_FAILED";
    error.publicMessage = message;
    if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
    throw error;
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    const error = new Error("GitHub Models returned an empty response.");
    error.statusCode = 502;
    throw error;
  }

  return {
    model,
    report: parseJsonReport(content)
  };
}

async function requestModel({ token, messages, model }) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Accept": "application/vnd.github+json",
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.35,
      max_tokens: 1400,
      response_format: { type: "json_object" }
    })
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function shouldRetryWithDefaultModel(response, data, model) {
  if (model === DEFAULT_MODEL) return false;
  const message = modelErrorMessage(data).toLowerCase();
  return message.includes("unknown model");
}

function modelErrorMessage(data) {
  return data.message || data.error?.message || "";
}

function authErrorMessage(status) {
  if (status === 401) {
    return "AI scouting is temporarily unavailable. The site owner needs to reconnect GitHub Models access.";
  }
  if (status === 403) {
    return "AI scouting is temporarily unavailable because GitHub Models access is blocked for this site.";
  }
  return "";
}

function providerLimitMessage(status, data) {
  const message = modelErrorMessage(data).toLowerCase();
  if (status === 429 || message.includes("rate limit") || message.includes("quota")) {
    return "The AI scout quota is busy right now. Please wait a bit and try again.";
  }
  if (status === 402 || message.includes("billing")) {
    return "The AI scout quota is exhausted for now. Please try again later.";
  }
  return "";
}

function buildSystemPrompt(tool) {
  const base = `
You are WCF Scout 2026, an expert FIFA World Cup Fantasy analyst.
Use only the user-provided player, fixture, ownership, and context. Do not invent recent stats, injuries, or confirmed lineups.
If information is missing, state the uncertainty as a risk.
Ground every points discussion in these official rules:
${scoringRules}
Return valid JSON only. No markdown fences.`;

  if (tool === "captaincy") {
    return `${base}
For captaincy, balance ceiling, minutes security, fixture, position scoring, and floor actions.
Output this JSON shape:
{
  "title": "Captaincy Report",
  "headline": "one sentence",
  "rankings": [
    {"rank": 1, "name": "string", "team": "string", "fixture": "string", "confidence": "High|Medium|Low", "differential": true, "caseFor": "string", "risk": "string"}
  ],
  "viceCaptain": {"name": "string", "reason": "string"},
  "differentialPunts": ["string"],
  "risks": ["string"],
  "recommendation": "string"
}`;
  }

  return `${base}
For the differential scout, estimate a realistic point ceiling from actions that fit the player's position and context.
Apply the scouting bonus only when ownership is under 5%; explain that the player still needs 4+ match points to trigger it.
Output this JSON shape:
{
  "title": "Player name - Differential Report",
  "verdict": "Strong Pick|Moderate|Risky",
  "confidence": "High|Medium|Low",
  "headline": "one sentence",
  "scoreBreakdown": [
    {"label": "string", "points": 2, "note": "string"}
  ],
  "totalCeiling": 10,
  "scoutingBonus": {"eligible": true, "points": 2, "reason": "string"},
  "risks": ["string"],
  "recommendation": "string"
}`;
}

function buildUserPrompt(tool, payload) {
  if (tool === "captaincy") {
    return `Optimize captaincy for this starting XI:
${JSON.stringify(payload.players || [], null, 2)}

Matchday context:
${payload.context || "No extra context provided."}`;
  }

  return `Analyze this differential candidate:
${JSON.stringify(payload || {}, null, 2)}`;
}

function parseJsonReport(content) {
  try {
    return JSON.parse(content);
  } catch (error) {
    return {
      title: "Scout Report",
      verdict: "Review",
      confidence: "Low",
      headline: "The model returned text instead of JSON.",
      scoreBreakdown: [],
      scoutingBonus: { eligible: false, points: 0, reason: "Could not parse structured bonus output." },
      risks: ["Try running the request again."],
      recommendation: content
    };
  }
}

module.exports = {
  analyzeWcfRequest,
  getModel
};
