// Use strict mode
'use strict'

/**
 * Reliability Metrics Exporter Tests
 * Tests for factory-pipeline reliability metrics exporter.
 */
const { computeMetrics } = require('..\\..\\scripts\\automation\\reliability-metrics.cjs')

describe('Factory V3 Reliability Metrics', () => {
  describe('computeMetrics', () => {
    it('should return metrics with state_present=true when state file exists', () => {
      const result = computeMetrics()
      expect(result).toBeDefined()
      expect(result.version).toBe('factory-pipeline-v1.0.1')
      expect(result.state_present).toBe(true)
    })

    it('should include timestamp', () => {
      const result = computeMetrics()
      expect(result.timestamp).toBeDefined()
      expect(typeof result.timestamp).toBe('string')
    })

    it('should include pipeline_health', () => {
      const result = computeMetrics()
      expect(result.pipeline_health).toBeDefined()
    })

    it('should include projects_seen array', () => {
      const result = computeMetrics()
      expect(result.projects_seen).toBeDefined()
      expect(Array.isArray(result.projects_seen)).toBe(true)
    })
  })