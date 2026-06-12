const { analyzeWcfRequest } = require("../lib/github-models");
const { prepareAnalyzeRequest, serializeApiError } = require("../lib/analyze-guard");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const request = await prepareAnalyzeRequest(req, req.body || {});
    const result = await analyzeWcfRequest(request);
    return res.status(200).json(result);
  } catch (error) {
    const response = serializeApiError(error);
    Object.entries(response.headers).forEach(([key, value]) => res.setHeader(key, value));
    return res.status(response.statusCode).json(response.body);
  }
};
