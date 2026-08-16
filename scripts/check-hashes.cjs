#!/usr/bin/env node
const https = require("https");
const hashes = [
  "index-BKMVGTdx.js",  // référencé par live index.html
  "index-CSZLZF3t.js",  // mon build local
  "index-CWlqD9pT.css", // css référencé live
  "react-vendor-CLzekduW.js",
];
for (const h of hashes) {
  const u = "https://sargasses-martinique.com/assets/" + h;
  https.get(u, { timeout: 6000 }, (res) => {
    console.log(h.padEnd(28), res.statusCode, (res.headers["content-type"] || "").slice(0, 30), res.headers["content-length"] || "");
  }).on("error", (e) => console.log(h, "ERR", e.code)).on("timeout", function () { this.destroy(); console.log(h, "TIMEOUT"); });
}
