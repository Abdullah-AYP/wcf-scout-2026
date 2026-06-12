const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

assert(html.includes('name="viewport" content="width=device-width, initial-scale=1"'));
assert(css.includes("@media (max-width: 720px)"));
assert(css.includes("@media (max-width: 420px)"));
assert(css.includes(".workspace"));
assert(css.includes("grid-template-columns: 1fr"));
assert(css.includes(".builder-layout"));
assert(css.includes(".formation-pitch"));
assert(css.includes(".player-inspector"));
assert(css.includes(".site-footer"));

console.log("mobile smoke tests passed");
