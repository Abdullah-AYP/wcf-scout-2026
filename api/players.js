const { getPlayerData } = require("../lib/player-data");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    const data = await getPlayerData();
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=1800");
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Could not load player data."
    });
  }
};
