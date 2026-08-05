const MAX_HISTORY_PER_MODEL = 100;
const FAILURE_WINDOW_MS = 2 * 60 * 60 * 1000;
const DEFAULT_UNHEALTHY_THRESHOLD = 0.2;

class FailureHistory {
  constructor(options = {}) {
    this.history = new Map();
    this.maxPerModel = options.maxPerModel || MAX_HISTORY_PER_MODEL;
    this.windowMs = options.windowMs || FAILURE_WINDOW_MS;
    this.unhealthyThreshold = options.unhealthyThreshold ?? DEFAULT_UNHEALTHY_THRESHOLD;
    this.onFailureRecorded = options.onFailureRecorded || (() => {});
    this.persistence = options.persistence || null;
  }

  setPersistence(persistence) {
    this.persistence = persistence;
  }

  record(modelId, failure) {
    const now = Date.now();
    let modelHistory = this.history.get(modelId) || [];
    modelHistory.push({
      timestamp: now,
      error: failure.error || 'Unknown error',
      code: failure.code,
      latency: failure.latency,
      attempt: failure.attempt,
      contextSize: failure.contextSize,
    });
    if (modelHistory.length > this.maxPerModel) {
      modelHistory = modelHistory.slice(-this.maxPerModel);
    }
    this.history.set(modelId, modelHistory);
    this.onFailureRecorded(modelId, this.getRecent(modelId));
    if (this.persistence) {
      this.persistence.append('failure_recorded', { modelId, failure, timestamp: now });
    }
  }

  getRecent(modelId, windowMs = this.windowMs) {
    const modelHistory = this.history.get(modelId) || [];
    const cutoff = Date.now() - windowMs;
    return modelHistory.filter(h => h.timestamp >= cutoff);
  }

  getFailureCount(modelId, windowMs = this.windowMs) {
    return this.getRecent(modelId, windowMs).length;
  }

  getFailureRate(modelId, windowMs = this.windowMs) {
    const recent = this.getRecent(modelId, windowMs);
    if (recent.length === 0) return 0;
    const totalAttempts = recent.reduce((sum, h) => sum + (h.attempt || 1), 0);
    return recent.length / Math.max(1, totalAttempts);
  }

  getAverageLatency(modelId, windowMs = this.windowMs) {
    const recent = this.getRecent(modelId, windowMs).filter(h => h.latency);
    if (recent.length === 0) return null;
    return recent.reduce((sum, h) => sum + h.latency, 0) / recent.length;
  }

  getLastError(modelId) {
    const modelHistory = this.history.get(modelId) || [];
    return modelHistory.length > 0 ? modelHistory[modelHistory.length - 1] : null;
  }

  getErrorCodes(modelId, windowMs = this.windowMs) {
    const recent = this.getRecent(modelId, windowMs);
    const codes = {};
    for (const h of recent) {
      if (h.code) codes[h.code] = (codes[h.code] || 0) + 1;
    }
    return codes;
  }

  isUnhealthy(modelId, threshold = this.unhealthyThreshold, windowMs = this.windowMs) {
    return this.getFailureRate(modelId, windowMs) >= threshold;
  }

  isDegraded(modelId, threshold = 0.15, windowMs = this.windowMs) {
    const rate = this.getFailureRate(modelId, windowMs);
    return rate >= threshold && rate < this.unhealthyThreshold;
  }

  getHealthIndicator(modelId) {
    const rate = this.getFailureRate(modelId);
    if (rate >= this.unhealthyThreshold) return 'unhealthy';
    if (rate >= 0.15) return 'degraded';
    return 'healthy';
  }

  getAll() {
    const result = {};
    for (const modelId of this.history.keys()) {
      result[modelId] = {
        recent: this.getRecent(modelId),
        failureCount: this.getFailureCount(modelId),
        failureRate: this.getFailureRate(modelId),
        avgLatency: this.getAverageLatency(modelId),
        lastError: this.getLastError(modelId),
        errorCodes: this.getErrorCodes(modelId),
        unhealthy: this.isUnhealthy(modelId),
        degraded: this.isDegraded(modelId),
        healthIndicator: this.getHealthIndicator(modelId),
      };
    }
    return result;
  }

  clear(modelId) {
    if (modelId) {
      this.history.delete(modelId);
    } else {
      this.history.clear();
    }
  }

  getUnhealthyModels(threshold = this.unhealthyThreshold) {
    const unhealthy = [];
    for (const modelId of this.history.keys()) {
      if (this.isUnhealthy(modelId, threshold)) {
        unhealthy.push(modelId);
      }
    }
    return unhealthy;
  }

  loadFromPersistence(data) {
    if (!data || !data.history) return;
    for (const [modelId, entries] of Object.entries(data.history)) {
      this.history.set(modelId, entries);
    }
  }

  toPersistence() {
    const history = {};
    for (const [modelId, entries] of this.history.entries()) {
      history[modelId] = entries;
    }
    return { history };
  }
}

export { FailureHistory, DEFAULT_UNHEALTHY_THRESHOLD };
export default FailureHistory;