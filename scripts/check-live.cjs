#!/usr/bin/env node
const https = require("https");
const checks = [
  ["JS MQ      ", "https://sargasses-martinique.com/assets/index-CSZLZF3t.js"],
  ["version MQ ", "https://sargasses-martinique.com/version.json"],
  ["index MQ   ", "https://sargasses-martinique.com/"],
];
for (const [label, u] of checks) {
  https
    .get(u, { timeout: 6000 }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c.slice(0, 800)));
      res.on("end", () => {
        console.log(label, res.statusCode, (res.headers["content-type"] || "").slice(0, 30));
        if (u.includes("version")) console.log("   body:", d.slice(0, 150));
        if (u.endsWith("/")) {
          const m = d.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
          const meta = d.match(/http-equiv="refresh"[^>]*url=([^"' >]+)/);
          console.log("   refs JS:", m ? m[0] : "(none)");
          console.log("   meta refresh:", meta ? meta[1] : "(none)");
        }
      });
    })
    .on("error", (e) => console.log(label, "ERR", e.code))
    .on("timeout", function () {
      this.destroy();
      console.log(label, "TIMEOUT");
    });
}
