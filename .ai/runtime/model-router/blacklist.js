const DEFAULT_BLACKLIST_DURATION = 5 * 60 * 1000;
const MAX_BLACKLIST_DURATION = 60 * 60 * 1000;

const HEALTH_STATES = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  BLACKLISTED: 'blacklisted',
  UNAVAILABLE: 'unavailable',
};

const DEGRADED_THRESHOLD = 0.15;
const UNHEALTHY_THRESHOLD = 0.2;

class ModelBlacklist {
  constructor(options = {}) {
    this.blacklist = new Map();
    this.defaultDuration = options.defaultDuration || DEFAULT_BLACKLIST_DURATION;
    this.maxDuration = options.maxDuration || MAX_BLACKLIST_DURATION;
    this.onBlacklistChange = options.onBlacklistChange || (() => {});
    this.failureHistoryRef = options.failureHistoryRef || null;
    this.quotaManagerRef = options.quotaManagerRef || null;
    this.clientRegistryRef = options.clientRegistryRef || null;
    this.persistence = options.persistence || null;
  }

  setRefs({ failureHistory, quotaManager, clientRegistry, persistence }) {
    this.failureHistoryRef = failureHistory;
    this.quotaManagerRef = quotaManager;
    this.clientRegistryRef = clientRegistry;
    this.persistence = persistence || this.persistence;
  }

  add(modelId, duration = this.defaultDuration, reason = 'manual') {
    const clampedDuration = Math.min(Math.max(duration, 1000), this.maxDuration);
    const until = Date.now() + clampedDuration;
    const entry = { modelId, until, reason, addedAt: Date.now(), state: HEALTH_STATES.BLACKLISTED };
    this.blacklist.set(modelId, entry);
    this.onBlacklistChange(this.getAll());
    if (this.persistence) {
      this.persistence.append('model_blacklisted', { modelId, duration: clampedDuration, reason, until });
    }
    return entry;
  }

  remove(modelId) {
    const existed = this.blacklist.has(modelId);
    this.blacklist.delete(modelId);
    if (existed) {
      this.onBlacklistChange(this.getAll());
      if (this.persistence) {
        this.persistence.append('model_unblacklisted', { modelId });
      }
    }
    return existed;
  }

  isBlacklisted(modelId) {
    const entry = this.blacklist.get(modelId);
    if (!entry) return false;
    if (Date.now() >= entry.until) {
      this.blacklist.delete(modelId);
      this.onBlacklistChange(this.getAll());
      if (this.persistence) {
        this.persistence.append('model_blacklist_expired', { modelId });
      }
      return false;
    }
    return true;
  }

  getRemainingTime(modelId) {
    const entry = this.blacklist.get(modelId);
    if (!entry) return 0;
    const remaining = entry.until - Date.now();
    return remaining > 0 ? remaining : 0;
  }

  getEntry(modelId) {
    const entry = this.blacklist.get(modelId);
    if (!entry) return null;
    if (Date.now() >= entry.until) {
      this.blacklist.delete(modelId);
      this.onBlacklistChange(this.getAll());
      return null;
    }
    return { ...entry };
  }

  getHealthState(modelId) {
    if (this.isBlacklisted(modelId)) return HEALTH_STATES.BLACKLISTED;

    if (this.quotaManagerRef) {
      const quota = this.quotaManagerRef.getQuota(modelId);
      if (quota && (quota.available.requests <= 0 || quota.available.tokens <= 0)) {
        return HEALTH_STATES.UNAVAILABLE;
      }
    }

    if (this.clientRegistryRef && !this.clientRegistryRef.has(modelId)) {
      return HEALTH_STATES.UNAVAILABLE;
    }

    if (this.failureHistoryRef) {
      const failureRate = this.failureHistoryRef.getFailureRate(modelId);
      if (failureRate >= UNHEALTHY_THRESHOLD) return HEALTH_STATES.BLACKLISTED;
      if (failureRate >= DEGRADED_THRESHOLD) return HEALTH_STATES.DEGRADED;
    }

    return HEALTH_STATES.HEALTHY;
  }

  getAll() {
    const now = Date.now();
    const active = [];
    for (const [modelId, entry] of this.blacklist.entries()) {
      if (entry.until > now) {
        active.push({ ...entry, remaining: entry.until - now });
      } else {
        this.blacklist.delete(modelId);
      }
    }
    return active;
  }

  clear() {
    this.blacklist.clear();
    this.onBlacklistChange([]);
  }

  getBlacklistedModels() {
    return this.getAll().map(e => e.modelId);
  }

  getHealthStates() {
    const states = {};
    const modelIds = new Set([
      ...this.blacklist.keys(),
      ...(this.quotaManagerRef ? this.quotaManagerRef.getAll().keys() : []),
      ...(this.failureHistoryRef ? this.failureHistoryRef.history.keys() : []),
      ...(this.clientRegistryRef ? this.clientRegistryRef.keys() : []),
    ]);
    for (const modelId of modelIds) {
      states[modelId] = this.getHealthState(modelId);
    }
    return states;
  }

  toPersistence() {
    const entries = {};
    for (const [modelId, entry] of this.blacklist.entries()) {
      entries[modelId] = entry;
    }
    return { entries };
  }

  loadFromPersistence(data) {
    if (!data || !data.entries) return;
    for (const [modelId, entry] of Object.entries(data.entries)) {
      if (entry.until > Date.now()) {
        this.blacklist.set(modelId, entry);
      }
    }
  }
}

export { ModelBlacklist, HEALTH_STATES, DEGRADED_THRESHOLD, UNHEALTHY_THRESHOLD };
export default ModelBlacklist;