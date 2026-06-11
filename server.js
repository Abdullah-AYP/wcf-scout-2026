const fs = require("fs");
const http = require("http");
const path = require("path");
const { analyzeWcfRequest, getModel } = require("./lib/github-models");
const { getPlayerData } = require("./lib/player-data");

loadDotEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "127.0.0.1";
const PUBLIC_DIR = __dirname;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/analyze") {
      return handleAnalyze(req, res);
    }

    if (url.pathname === "/api/players") {
      return handlePlayers(req, res);
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message || "Unexpected server error." }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`WCF Scout running at http://${HOST}:${PORT}`);
  console.log(`Model: ${getModel()}`);
});

async function handleAnalyze(req, res) {
  try {
    if (req.method !== "POST") {
      res.writeHead(405, { "Allow": "POST", "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Method not allowed." }));
      return;
    }

    const body = await readBody(req);
    const result = await analyzeWcfRequest(JSON.parse(body || "{}"));
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(result));
  } catch (error) {
    res.writeHead(error.statusCode || 500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message || "Unexpected server error." }));
  }
}

async function handlePlayers(req, res) {
  try {
    if (req.method !== "GET") {
      res.writeHead(405, { "Allow": "GET", "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Method not allowed." }));
      return;
    }

    const data = await getPlayerData();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(data));
  } catch (error) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: error.message || "Could not load player data." }));
  }
}

function serveStatic(pathname, res) {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, normalized));

  if (!filePath.startsWith(PUBLIC_DIR) || filePath.includes(`${path.sep}api${path.sep}`) || filePath.includes(`${path.sep}lib${path.sep}`)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 80_000) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  });
}
