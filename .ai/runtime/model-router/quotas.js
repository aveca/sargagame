class QuotaManager {
  constructor(options = {}) {
    this.quotas = new Map();
    this.defaultQuota = options.defaultQuota || { requests: 1000, tokens: 1000000, windowMs: 2 * 60 * 60 * 1000 };
    this.onQuotaChange = options.onQuotaChange || (() => {});
    this.globalBudget = options.globalBudget || { maxCostPerHour: 10, maxCostPerDay: 50, currency: 'USD' };
    this.persistence = options.persistence || null;
    this.costLedger = options.costLedger || null;
  }

  setQuota(modelId, quota) {
    const now = Date.now();
    const windowMs = quota.windowMs || this.defaultQuota.windowMs;
    this.quotas.set(modelId, {
      limit: { requests: quota.requests || this.defaultQuota.requests, tokens: quota.tokens || this.defaultQuota.tokens },
      used: { requests: 0, tokens: 0 },
      windowStart: now,
      windowMs,
    });
    this.onQuotaChange(this.getAll());
    if (this.persistence) {
      this.persistence.append('quota_set', { modelId, quota });
    }
  }

  getQuota(modelId) {
    const quota = this.quotas.get(modelId);
    if (!quota) return null;
    this._resetIfExpired(quota);
    return { ...quota, available: this._getAvailable(quota) };
  }

  _resetIfExpired(quota) {
    const now = Date.now();
    if (now - quota.windowStart >= quota.windowMs) {
      quota.used = { requests: 0, tokens: 0 };
      quota.windowStart = now;
    }
  }

  _getAvailable(quota) {
    return {
      requests: Math.max(0, quota.limit.requests - quota.used.requests),
      tokens: Math.max(0, quota.limit.tokens - quota.used.tokens),
    };
  }

  consume(modelId, tokens = 0, cost = 0) {
    const quota = this.quotas.get(modelId);
    if (!quota) return { allowed: true, remaining: { requests: Infinity, tokens: Infinity } };
    this._resetIfExpired(quota);
    quota.used.requests += 1;
    quota.used.tokens += tokens;
    if (this.costLedger && cost > 0) {
      this.costLedger.record(modelId, 0, tokens, cost);
    }
    this.onQuotaChange(this.getAll());
    if (this.persistence) {
      this.persistence.append('quota_consumed', { modelId, tokens, cost });
    }
    return { allowed: true, remaining: this._getAvailable(quota) };
  }

  canConsume(modelId, estimatedTokens = 0, estimatedCost = 0) {
    const quota = this.quotas.get(modelId);
    if (!quota) return { allowed: true, reason: null };
    this._resetIfExpired(quota);
    const available = this._getAvailable(quota);
    if (available.requests <= 0) return { allowed: false, reason: 'request-quota-exhausted' };
    if (available.tokens < estimatedTokens) return { allowed: false, reason: 'token-quota-exhausted' };
    if (!this._checkGlobalBudget(estimatedCost)) return { allowed: false, reason: 'global-budget-exceeded' };
    return { allowed: true, reason: null };
  }

  _checkGlobalBudget(estimatedCost) {
    if (!this.costLedger) return true;
    const status = this.costLedger.getBudgetStatus();
    return (status.hourly.used + estimatedCost <= status.hourly.limit) &&
           (status.daily.used + estimatedCost <= status.daily.limit);
  }

  getGlobalBudgetStatus() {
    if (this.costLedger) {
      return this.costLedger.getBudgetStatus();
    }
    return {
      hourly: { used: 0, limit: this.globalBudget.maxCostPerHour, remaining: this.globalBudget.maxCostPerHour },
      daily: { used: 0, limit: this.globalBudget.maxCostPerDay, remaining: this.globalBudget.maxCostPerDay },
      currency: this.globalBudget.currency,
    };
  }

  setGlobalBudget(budget) {
    this.globalBudget = { ...this.globalBudget, ...budget };
    if (this.costLedger) {
      this.costLedger.dailyBudget = this.globalBudget.maxCostPerDay;
      this.costLedger.hourlyBudget = this.globalBudget.maxCostPerHour;
    }
  }

  getUsage(modelId) {
    const quota = this.quotas.get(modelId);
    if (!quota) return null;
    this._resetIfExpired(quota);
    return { ...quota.used, ...this._getAvailable(quota), limit: { ...quota.limit } };
  }

  getAll() {
    const result = {};
    for (const [modelId, quota] of this.quotas.entries()) {
      this._resetIfExpired(quota);
      result[modelId] = { ...quota, available: this._getAvailable(quota) };
    }
    return result;
  }

  reset(modelId) {
    const quota = this.quotas.get(modelId);
    if (quota) {
      quota.used = { requests: 0, tokens: 0 };
      quota.windowStart = Date.now();
      this.onQuotaChange(this.getAll());
    }
  }

  clear() {
    this.quotas.clear();
    this.onQuotaChange({});
  }

  toPersistence() {
    const quotas = {};
    for (const [modelId, quota] of this.quotas.entries()) {
      quotas[modelId] = { ...quota };
    }
    return { quotas, globalBudget: this.globalBudget };
  }

  loadFromPersistence(data) {
    if (!data || !data.quotas) return;
    for (const [modelId, quota] of Object.entries(data.quotas)) {
      this.quotas.set(modelId, { ...quota });
    }
    if (data.globalBudget) {
      this.globalBudget = { ...this.globalBudget, ...data.globalBudget };
    }
  }
}

export { QuotaManager };
export default QuotaManager;