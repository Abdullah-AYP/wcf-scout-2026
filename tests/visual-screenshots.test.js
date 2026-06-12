const assert = require("assert");
const fs = require("fs");
const http = require("http");
const path = require("path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (error) {
  console.log("visual screenshot tests skipped: install playwright to run browser screenshots");
  process.exit(0);
}

const { getPlayerData } = require("../lib/player-data");
const root = path.join(__dirname, "..");
const outputDir = path.join(root, "test-artifacts", "screenshots");

const viewports = [
  ["desktop-1440-dark", { width: 1440, height: 1000 }, "dark"],
  ["tablet-768-dark", { width: 768, height: 1024 }, "dark"],
  ["mobile-390-dark", { width: 390, height: 844 }, "dark"],
  ["desktop-1440-light", { width: 1440, height: 1000 }, "light"]
];

function contentType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".xml": "application/xml; charset=utf-8"
  }[path.extname(filePath)] || "application/octet-stream";
}

function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    if (url.pathname === "/api/players") {
      const data = await getPlayerData();
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === "/api/analyze") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ model: "test", report: { title: "Visual Test", headline: "Smoke test" } }));
      return;
    }

    const filePath = path.normalize(path.join(root, url.pathname === "/" ? "index.html" : url.pathname));
    if (!filePath.startsWith(root) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

(async () => {
  fs.mkdirSync(outputDir, { recursive: true });
  const server = createServer();
  try {
    await listen(server);
  } catch (error) {
    if (error.code === "EPERM") {
      console.log("visual screenshot tests skipped: local server binding is blocked in this environment");
      return;
    }
    throw error;
  }
  const port = server.address().port;
  const browser = await chromium.launch();

  try {
    for (const [name, viewport, theme] of viewports) {
      const page = await browser.newPage({ viewport });
      await page.goto(`http://127.0.0.1:${port}`, { waitUntil: "load" });
      await page.evaluate((value) => localStorage.setItem("wcf-theme", value), theme);
      await page.reload({ waitUntil: "load" });
      await page.waitForSelector("#differential-player-results .player-option", { timeout: 10000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      assert.strictEqual(overflow, false, `${name} has horizontal overflow`);
      await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log("visual screenshot tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
