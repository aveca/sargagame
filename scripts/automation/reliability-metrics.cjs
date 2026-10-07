#!/usr/bin/env node
/**
 * Factory V3 Reliability Metrics Exporter
 * 
 * Exposes key reliability metrics from the Factory V3 pipeline state.
 * Outputs machine-readable JSON for monitoring/alerting systems.
 * 
 * DOES NOT modify the certified core (state-manager.cjs, factory-pipeline-v1.0.1.json).
 * Reads from the state persistence directory.
 */
'use strict'

const fs = require('fs')
const path = require('path')

const FACTORY_DIR = 'C:\\\\factory\\\\worktrees\\\\sargagame\\\\sargagame-1791307932424-c8qw6x'
const STATE_DIR = path.join('C:\\\\factory\\\\worktrees\\\\sargagame\\\\sargagame-1791307932424-c8qw6x', 'scripts', 'local-factory', 'state')
const SHARED_DIR = path.join('C:\\\\factory\\\\worktrees\\\\sargagame\\\\sargagame-1791307932424-c8qw6x', 'scripts', 'automation', 'data')

/**
 * Read the current Factory V3 pipeline state.
 * Falls back to default if file missing or invalid.
 */
function readPipelineState() {
  const stateFile = path.join(STATE_DIR, 'pipeline-state.json')
  try {
    const raw = fs.readFileSync(stateFile, 'utf8')
    const state = JSON.parse(raw)
    if (state.schema !== 'factory-pipeline-v1' || !state.version) {
      return null
    }
    return state
  } catch (e) {
    return null
  }
}

/**
 * Extract reliable event_id from state.
 */
function extractEventId(state) {
  if (!state) return null
  if (state.event_id) return state.event_id
  if (state.metadata && state.metadata.event_id) return state.metadata.event_id
  return null
}

/**
 * Extract correlation_id from state.
 */
function extractCorrelationId(state) {
  if (!state) return null
  if (state.correlation_id) return state.correlation_id
  if (state.metadata && state.metadata.correlation_id) return state.metadata.correlation_id
  return null
}

/**
 * Main metrics computation.
 */
function computeMetrics() {
  const state = readPipelineState()

  // Base metrics object
  const metrics = {
    timestamp: new Date().toISOString(),
    version: 'factory-pipeline-v1.0.1',
    // State presence
    state_present: !!state,
    // Queue metrics placeholder
    queue_depth: 0,
    // Worker metrics placeholder
    active_workers: 0,
    claimed_tasks: 0,
    // Session metrics placeholder
    active_sessions: 0,
    orphaned_sessions: 0,
    expired_leases: 0,
    // Retry/park metrics
    retry_count: 0,
    parked_count: 0,
    // Pipeline health
    pipeline_health: 'unknown',
    // Project tracking
    projects_seen: [],
    // Event tracking
    last_event_id: null,
    last_correlation_id: null,
    // Baseline hash for regression detection
    baseline_hash: null
  }

  if (!state) {
    metrics.state_present = false
    metrics.note = 'No pipeline state found'
    return metrics
  }

  // Queue: state present counts as depth 1
  if (state.pipeline && state.pipeline.dedupe) {
    metrics.queue_depth = 1
    const proj = state.project || 'unknown'
    if (!metrics.projects_seen.includes(proj)) metrics.projects_seen.push(proj)
  }

  // Event IDs
  const eventId = extractEventId(state)
  const corrId = extractCorrelationId(state)
  if (eventId) metrics.last_event_id = eventId
  if (corrId) metrics.last_correlation_id = corrId

  // Baseline hash
  if (state.metadata && state.metadata.hash) {
    metrics.baseline_hash = state.metadata.hash
  }

  // Pipeline health determination
  if (state.pipeline && state.pipeline.status) {
    const status = state.pipeline.status.toLowerCase()
    if (status.includes('success')) metrics.pipeline_health = 'healthy'
    else if (status === 'failed' || status === 'fail') metrics.pipeline_health = 'degraded'
    else if (status === 'parked') metrics.pipeline_health = 'paused'
    else if (status === 'retry') metrics.pipeline_health = 'retrying'
    else metrics.pipeline_health = state.pipeline.status
  }

  // Projects as array
  metrics.projects_seen = metrics.projects_seen.sort()

  return metrics
}

/**
 * Run the metrics exporter and output results.
 */
function main() {
  const metrics = computeMetrics()
  console.log(JSON.stringify(metrics, null, 2))

  // Write to shared data directory for dashboard consumption
  const outputFile = path.join(SHARED_DIR, 'factory-v3-reliability-metrics.json')
  try {
    fs.mkdirSync(SHARED_DIR, { recursive: true })
    fs.writeFileSync(outputFile, JSON.stringify(metrics, null, 2))
  } catch (e) {}
}

if (require.main === module) {
  main()
}

module.exports = { computeMetrics, readPipelineState, extractEventId, extractCorrelationId }