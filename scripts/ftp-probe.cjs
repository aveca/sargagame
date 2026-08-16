#!/usr/bin/env node
const { Client } = require("basic-ftp")
const fs = require("fs")
const { loadProjectEnv } = require("./lib/load-project-env.cjs")
loadProjectEnv()

async function probe() {
  const c = new Client()
  await c.access({
    host: process.env.FTP_HOST_MQ,
    user: process.env.FTP_USER_MQ,
    password: process.env.FTP_PASS_MQ,
    secure: true,
    secureOptions: { rejectUnauthorized: false },
  })

  // Upload a PHP probe script
  const probePhp = Buffer.from(`<?php header('Content-Type: text/plain'); echo 'DOCROOT:' . $_SERVER['DOCUMENT_ROOT'] . '\\nCWD:' . getcwd() . '\\nSCRIPT:' . __FILE__ . '\\n'; ?>`)
  const tmpLocal = require("path").join(__dirname, "_probe.php")
  fs.writeFileSync(tmpLocal, probePhp)
  await c.uploadFrom(tmpLocal, "_probe.php")
  console.log("Uploaded _probe.php")

  // Also upload a PHP that reads index.html from DOCUMENT_ROOT
  const readPhp = Buffer.from(`<?php header('Content-Type: text/plain'); $f=$_SERVER['DOCUMENT_ROOT'].'/index.html'; echo 'EXISTS:'.(file_exists($f)?'yes':'no').'\\nSIZE:'.filesize($f).'\\nFIRST200:'.substr(file_get_contents($f),0,200).'\\n'; ?>`)
  fs.writeFileSync(tmpLocal, readPhp)
  await c.uploadFrom(tmpLocal, "_read.php")
  console.log("Uploaded _read.php")

  c.close()
  fs.unlinkSync(tmpLocal)

  // Now fetch them via HTTPS
  const https = require("https")
  function fetch(url) {
    return new Promise((resolve) => {
      https.get(url, { timeout: 5000 }, (res) => {
        let d = ""
        res.on("data", c => d += c)
        res.on("end", () => resolve(d))
      }).on("error", e => resolve("ERR:" + e.code))
    })
  }
  console.log("\n--- _probe.php ---")
  console.log(await fetch("https://sargasses-martinique.com/_probe.php"))
  console.log("--- _read.php ---")
  console.log(await fetch("https://sargasses-martinique.com/_read.php"))
}
probe().catch(e => { console.error("FATAL:", e.message); process.exit(1) })
