import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "abf2b92cf718313567b4b38eb9dda17f";
const DATABASE_ID = process.env.CF_D1_DATABASE_ID || "3e7179cd-8058-4881-9eea-c58527dfb3a3";
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const REPO = "aveca/sargagame";
const API = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

async function query(sql, params = []) {
  if (!API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN is not configured");
  const response = await fetch(API, {
    method: "POST",
    headers: { authorization: `Bearer ${API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params: params.map((v) => String(v)) }),
  });
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    throw new Error(`Cloudflare D1 API failed (${response.status}): ${JSON.stringify(body.errors || body).slice(0, 1500)}`);
  }
  const first = body.result?.[0];
  if (!first?.success) throw new Error(`D1 query failed: ${JSON.stringify(first?.results || first).slice(0, 1500)}`);
  return first;
}

async function event(type, status, payload = {}) {
  await query(
    "INSERT INTO factory_events (id,ts,source,event_type,repo,status,payload) VALUES (?,?,?,?,?,?,?)",
    [crypto.randomUUID(), new Date().toISOString(), "github-actions-cloud-runner", type, REPO, status, JSON.stringify(payload).slice(0, 10000)],
  );
}

async function heartbeat(details) {
  await query(
    "INSERT INTO factory_heartbeats (ts,source,details) VALUES (?,?,?)",
    [new Date().toISOString(), "github-actions-cloud-runner", JSON.stringify(details).slice(0, 4000)],
  );
}

function setOutput(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${String(value).replace(/[\r\n]/g, " ")}\n`);
}

async function claim() {
  const result = await query(
    "SELECT id,repo,task_type,payload FROM factory_jobs WHERE repo=? AND status='queued' ORDER BY created_at ASC LIMIT 1",
    [REPO],
  );
  const job = result.results?.[0];
  if (!job) {
    await heartbeat({ status: "idle", message: "No queued Sargagame task", runner: "github-hosted-ollama" });
    setOutput("has_job", "false");
    console.log("No queued Sargagame task.");
    return;
  }

  const claimed = await query(
    "UPDATE factory_jobs SET status='running',updated_at=?,attempts=attempts+1 WHERE id=? AND status='queued'",
    [new Date().toISOString(), job.id],
  );
  if (Number(claimed.meta?.changes || 0) !== 1) {
    setOutput("has_job", "false");
    console.log("Task was claimed by another runner; exiting.");
    return;
  }

  let payload;
  try { payload = JSON.parse(job.payload || "{}"); }
  catch { payload = { prompt: String(job.payload || "") }; }
  const prompt = String(payload.prompt || payload.task || payload.description || payload.message || "").trim();
  if (!prompt || prompt.length > 12000) {
    await query(
      "UPDATE factory_jobs SET status='failed',updated_at=?,result=? WHERE id=? AND status='running'",
      [new Date().toISOString(), JSON.stringify({ error: !prompt ? "Task payload has no prompt/task/description/message field" : "Task prompt exceeds 12000 characters" }), job.id],
    );
    await event("task_rejected", "failed", { job_id: job.id, reason: !prompt ? "missing_prompt" : "prompt_too_long" });
    setOutput("has_job", "false");
    console.log(`Rejected malformed task ${job.id}.`);
    return;
  }

  const temp = process.env.RUNNER_TEMP || "/tmp";
  fs.writeFileSync(path.join(temp, "factory-task.md"), prompt, { mode: 0o600 });
  fs.writeFileSync(path.join(temp, "factory-job.json"), JSON.stringify({ id: job.id, repo: job.repo, task_type: job.task_type, payload }), { mode: 0o600 });
  await event("task_claimed", "running", { job_id: job.id, task_type: job.task_type });
  await heartbeat({ status: "running", job_id: job.id, task_type: job.task_type, runner: "github-hosted-ollama" });
  setOutput("has_job", "true");
  setOutput("job_id", job.id);
  setOutput("task_type", job.task_type || "DEFAULT");
  console.log(`Claimed task ${job.id} (${job.task_type || "DEFAULT"}).`);
}

async function finish() {
  const jobId = process.env.FACTORY_JOB_ID;
  const status = process.env.FACTORY_FINAL_STATUS;
  if (!jobId || !["succeeded", "failed", "blocked"].includes(status)) throw new Error("FACTORY_JOB_ID or valid FACTORY_FINAL_STATUS missing");
  let result = {};
  try { result = JSON.parse(process.env.FACTORY_RESULT_JSON || "{}"); }
  catch { result = { summary: String(process.env.FACTORY_RESULT_JSON || "").slice(0, 3000) }; }
  const serialized = JSON.stringify(result).slice(0, 10000);
  await query(
    "UPDATE factory_jobs SET status=?,updated_at=?,result=? WHERE id=? AND status='running'",
    [status, new Date().toISOString(), serialized, jobId],
  );
  await event(`task_${status}`, status, { job_id: jobId, result });
  await heartbeat({ status, job_id: jobId, result });
  console.log(`Task ${jobId} marked ${status}.`);
}

const mode = process.argv[2] || "claim";
if (mode === "claim") await claim();
else if (mode === "finish") await finish();
else throw new Error(`Unknown mode: ${mode}`);
