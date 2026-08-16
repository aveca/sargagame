#!/usr/bin/env node
const https = require("https");
https.get("https://sargasses-martinique.com/", { timeout: 6000 }, (res) => {
  let d = "";
  res.on("data", (c) => (d += c));
  res.on("end", () => {
    console.log("STATUS:", res.statusCode, "LEN:", d.length);
    const m1 = d.match(/<script[^>]*src=["'][^"']+["'][^>]*>/g);
    const m2 = d.match(/\/assets\/[A-Za-z0-9_.-]+/g);
    const m3 = d.match(/index-[A-Za-z0-9_-]+/g);
    console.log("script tags:", m1 || "(none)");
    console.log("assets refs:", [...new Set(m2 || [])]);
    console.log("index- refs:", [...new Set(m3 || [])]);
    console.log("--- first 1500 chars ---");
    console.log(d.slice(0, 1500));
  });
}).on("error", (e) => console.log("ERR", e.code));
