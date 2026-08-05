import { getModelConfig, getModelsForTaskType, getAllModels, calculateConfidenceScore, estimateCost, CRITICALITY_PROFILES } from './models.js';
import { ModelBlacklist, HEALTH_STATES } from './blacklist.js';
import { QuotaManager } from './quotas.js';
import { FailureHistory } from './failure-history.js';
import { QueuePersistence, CostLedger } from './persistence.js';

const DEFAULT_ROUTER_OPTIONS = {
  defaultTaskType: 'default',
  defaultCriticality: 'P1',
  enableFallback: true,
  enableBlacklist: true,
  enableQuotas: true,
  enableFailureTracking: true,
  enableGlobalBudget: true,
  enableRetry: true,
  maxFallbackAttempts: 3,
  globalTimeout: 60000,
  queueEmitter: null,
  unhealthyThreshold: 0.2,
  persistenceEnabled: true,
  stateFile: null,
  queueFile: null,
  lockDir: null,
  installProcessExitHandlers: false,
  installUncaughtHandler: false,
};

class ModelRouter {
  constructor(options = {}) {
    this.options = { ...DEFAULT_ROUTER_OPTIONS, ...options };

    this.persistence = this.options.persistenceEnabled ? new QueuePersistence({
      queueFile: this.options.queueFile,
      stateFile: this.options.stateFile,
      lockDir: this.options.lockDir,
      installProcessExitHandlers: this.options.installProcessExitHandlers,
      installUncaughtHandler: this.options.installUncaughtHandler,
    }) : null;

    this.costLedger = this.options.persistenceEnabled ? new CostLedger({
      ledgerFile: this.options.costLedgerFile,
      dailyBudget: this.options.globalBudget?.maxCostPerDay || 50,
      hourlyBudget: this.options.globalBudget?.maxCostPerHour || 10,
    }) : null;

    this.blacklist = new ModelBlacklist({
      defaultDuration: options.blacklistDuration,
      onBlacklistChange: (list) => this._emit('blacklist-change', list),
      persistence: this.persistence,
    });

    this.quotas = new QuotaManager({
      defaultQuota: options.defaultQuota,
      globalBudget: options.globalBudget,
      onQuotaChange: (quotas) => this._emit('quota-change', quotas),
      persistence: this.persistence,
      costLedger: this.costLedger,
    });

    this.failureHistory = new FailureHistory({
      windowMs: options.failureWindowMs,
      unhealthyThreshold: this.options.unhealthyThreshold,
      onFailureRecorded: (modelId, history) => this._emit('failure-recorded', { modelId, history }),
      persistence: this.persistence,
    });

    this.modelClients = new Map();
    this.modelAvailability = new Map();
    this.eventListeners = new Map();
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackCount: 0,
      blacklistEvents: 0,
      quotaRejections: 0,
      budgetRejections: 0,
      retryCount: 0,
    };

    this.blacklist.setRefs({
      failureHistory: this.failureHistory,
      quotaManager: this.quotas,
      clientRegistry: this.modelClients,
      persistence: this.persistence,
    });

    this._loadState();

    if (this.persistence && this.options.persistenceEnabled && this.options.autoLock !== false) {
      const lockResult = this.persistence.acquireLock();
      if (!lockResult.acquired) {
        throw new Error(`ModelRouter cannot acquire router lock at ${this.persistence.lockDir}. Another instance is running.`);
      }
    }
  }

  _loadState() {
    if (!this.persistence) return;
    const state = this.persistence.loadState();
    if (!state) return;

    if (state.blacklist) this.blacklist.loadFromPersistence(state.blacklist);
    if (state.quotas) this.quotas.loadFromPersistence(state.quotas);
    if (state.failureHistory) this.failureHistory.loadFromPersistence(state.failureHistory);
  }

  _saveState() {
    if (!this.persistence) return;
    this.persistence.saveState(this.blacklist, this.quotas, this.failureHistory);
  }

  registerClient(modelId, client) {
    if (!client || typeof client.call !== 'function') {
      throw new Error(`Invalid client for model ${modelId}: must have a call() method`);
    }
    this.modelClients.set(modelId, client);
    this.modelAvailability.set(modelId, true);
    this._emit('client-registered', { modelId });
  }

  unregisterClient(modelId) {
    this.modelClients.delete(modelId);
    this.modelAvailability.set(modelId, false);
    this._emit('client-unregistered', { modelId });
  }

  setModelAvailability(modelId, available) {
    this.modelAvailability.set(modelId, available);
    this._emit('availability-change', { modelId, available });
  }

  hasClient(modelId) {
    return this.modelClients.has(modelId) && this.modelAvailability.get(modelId) !== false;
  }

  getAvailableModels(taskType = this.options.defaultTaskType) {
    const candidates = getModelsForTaskType(taskType);
    return candidates.filter(model => {
      if (!this.hasClient(model.id)) return false;
      const healthState = this.blacklist.getHealthState(model.id);
      if (healthState === HEALTH_STATES.BLACKLISTED || healthState === HEALTH_STATES.UNAVAILABLE) return false;
      if (this.options.enableFailureTracking) {
        const failureRate = this.failureHistory.getFailureRate(model.id);
        if (failureRate >= this.options.unhealthyThreshold) return false;
      }
      if (this.options.enableQuotas) {
        const quotaCheck = this.quotas.canConsume(model.id);
        if (!quotaCheck.allowed) return false;
      }
      return true;
    });
  }

  selectModel(request) {
    const {
      taskType = this.options.defaultTaskType,
      criticality = this.options.defaultCriticality,
      contextSize = 0,
      estimatedTokens = 0,
      estimatedInputTokens = 0,
      estimatedOutputTokens = 0,
      budget = null,
      constraints = {},
      preferredModels = [],
      excludedModels = [],
    } = request;

    let candidates = this.getAvailableModels(taskType);

    if (preferredModels.length > 0) {
      const preferred = preferredModels.map(id => getModelConfig(id)).filter(Boolean);
      const other = candidates.filter(m => !preferredModels.includes(m.id));
      candidates = [...preferred, ...other];
    }

    candidates = candidates.filter(m => !excludedModels.includes(m.id));

    if (constraints.deployment) {
      candidates = candidates.filter(m => m.deployment === constraints.deployment);
    }

    if (constraints.maxLatency) {
      const latencyOrder = { fast: 0, medium: 1, slow: 2 };
      const maxLatencyIdx = latencyOrder[constraints.maxLatency] ?? 2;
      candidates = candidates.filter(m => (latencyOrder[m.latencyProfile] ?? 2) <= maxLatencyIdx);
    }

    if (constraints.minReliability) {
      candidates = candidates.filter(m => m.reliability >= constraints.minReliability);
    }

    if (candidates.length === 0) {
      this._emitQueueEvent('model_selection_failed', { taskType, criticality, reason: 'no_available_models', preferredModels, excludedModels });
      throw new Error(`No available models for taskType: ${taskType}, criticality: ${criticality}`);
    }

    const scored = candidates.map(model => {
      const liveReliability = this._getLiveReliability(model.id);
      const liveLatency = this._getLiveLatency(model.id);
      let confidence = calculateConfidenceScore(model.id, contextSize, taskType, criticality);
      const declaredReliability = model.reliability || 1;
      if (declaredReliability > 0 && liveReliability < declaredReliability) {
        confidence *= (liveReliability / declaredReliability);
      }
      const estCost = estimateCost(model.id, estimatedInputTokens || estimatedTokens, estimatedOutputTokens || 0);
      const quotaCheck = this.quotas.canConsume(model.id, estimatedTokens, estCost);
      return {
        model,
        confidence,
        estimatedCost: estCost,
        quotaAllowed: quotaCheck.allowed,
        quotaReason: quotaCheck.reason,
        healthState: this.blacklist.getHealthState(model.id),
        liveReliability,
        liveLatency,
      };
    }).filter(s => s.quotaAllowed && s.healthState !== HEALTH_STATES.BLACKLISTED && s.healthState !== HEALTH_STATES.UNAVAILABLE);

    if (scored.length === 0) {
      this._emitQueueEvent('model_selection_failed', { taskType, criticality, reason: 'all_candidates_filtered' });
      throw new Error(`All candidates filtered out for taskType: ${taskType}, criticality: ${criticality}`);
    }

    scored.sort((a, b) => b.confidence - a.confidence);

    const selected = scored[0];
    const reason = this._generateSelectionReason(selected, scored, criticality);

    if (preferredModels.length > 0 && selected.model.id !== preferredModels[0]) {
      this._emitQueueEvent('preference_overridden', {
        taskType,
        criticality,
        preferred: preferredModels[0],
        selected: selected.model.id,
        reason,
      });
    }

    this._emitQueueEvent('model_selected', {
      taskType,
      criticality,
      modelId: selected.model.id,
      provider: selected.model.provider,
      confidence: selected.confidence,
      estimatedCost: selected.estimatedCost,
      reason,
      alternatives: scored.slice(1, 4).map(s => ({
        modelId: s.model.id,
        confidence: s.confidence,
        estimatedCost: s.estimatedCost,
      })),
    });

    return {
      modelId: selected.model.id,
      provider: selected.model.provider,
      confidence: selected.confidence,
      reason,
      estimatedCost: selected.estimatedCost,
      deployment: selected.model.deployment,
    };
  }

  _getLiveReliability(modelId) {
    const failureRate = this.failureHistory.getFailureRate(modelId);
    return Math.max(0, 1 - failureRate);
  }

  _getLiveLatency(modelId) {
    return this.failureHistory.getAverageLatency(modelId);
  }

  _generateSelectionReason(selected, allScored, criticality) {
    const profile = CRITICALITY_PROFILES[criticality] || CRITICALITY_PROFILES.P1;
    const reasons = [];

    if (selected.confidence > 0.8) reasons.push('high confidence');
    if (selected.model.reliability >= profile.minReliability) reasons.push('meets reliability threshold');
    if (selected.estimatedCost < 0.01) reasons.push('cost-effective');
    if (selected.healthState === HEALTH_STATES.HEALTHY) reasons.push('healthy');

    if (allScored.length > 1) {
      const diff = selected.confidence - allScored[1].confidence;
      if (diff > 0.1) reasons.push('clearly best option');
    }

    return reasons.join(', ') || 'default selection';
  }

  async call(request) {
    const {
      taskType,
      criticality,
      contextSize,
      estimatedTokens,
      estimatedInputTokens,
      estimatedOutputTokens,
      budget,
      constraints,
      messages,
      options = {},
      preferredModels = [],
      excludedModels = [],
      maxFallbackAttempts = this.options.maxFallbackAttempts,
      timeout = this.options.globalTimeout,
      onModelChange,
    } = request;

    this.metrics.totalRequests++;

    const attemptedModels = [];
    let lastError = null;
    let currentModel = null;
    let failedProvider = null;

    for (let attempt = 0; attempt <= maxFallbackAttempts; attempt++) {
      try {
        const selection = this.selectModel({
          taskType,
          criticality,
          contextSize,
          estimatedTokens,
          estimatedInputTokens,
          estimatedOutputTokens,
          budget,
          constraints,
          preferredModels: attempt === 0 ? preferredModels : [],
          excludedModels: [...excludedModels, ...attemptedModels],
        });

        currentModel = selection;
        attemptedModels.push(currentModel.modelId);

        if (attempt > 0) {
          this.metrics.fallbackCount++;
          this._emit('fallback', { from: attemptedModels[attempt - 1], to: currentModel.modelId, attempt });
          this._emitQueueEvent('fallback', { from: attemptedModels[attempt - 1], to: currentModel.modelId, attempt });
        }

        if (onModelChange) onModelChange(currentModel.modelId, attempt);

        const client = this.modelClients.get(currentModel.modelId);
        if (!client) throw new Error(`No client registered for model: ${currentModel.modelId}`);

        const modelConfig = getModelConfig(currentModel.modelId);
        const modelTimeout = options.timeout || modelConfig?.defaultTimeout || timeout;
        const retryConfig = modelConfig?.retryConfig || { maxRetries: 0, baseDelay: 1000, maxDelay: 10000 };

        const result = await this._callWithRetry(client, messages, options, modelTimeout, retryConfig);

        this._recordSuccess(currentModel.modelId, result, currentModel.estimatedCost);
        this._emitQueueEvent('call_success', { modelId: currentModel.modelId, tokens: result.tokens, cost: currentModel.estimatedCost });
        this._saveState();

        return {
          ...result,
          model: currentModel.modelId,
          provider: currentModel.provider,
          attempts: attempt + 1,
          fallbackUsed: attempt > 0,
          confidence: currentModel.confidence,
          estimatedCost: currentModel.estimatedCost,
        };
      } catch (error) {
        lastError = error;
        this._recordFailure(currentModel?.modelId || 'unknown', error, { attempt: attempt + 1, contextSize });
        this._emitQueueEvent('call_failure', { modelId: currentModel?.modelId, error: error.message, attempt: attempt + 1 });

        failedProvider = getModelConfig(currentModel?.modelId)?.provider;
        const shouldEscalate = this._shouldEscalate(error);
        if (shouldEscalate) {
          this._emitQueueEvent('escalation', { modelId: currentModel?.modelId, error: error.message, code: error.code });
          this._saveState();
          throw error;
        }

        if (this.options.enableBlacklist && this._shouldBlacklist(currentModel?.modelId, error)) {
          this.blacklist.add(currentModel.modelId, this._calculateBlacklistDuration(error), error.code || 'error');
          this.metrics.blacklistEvents++;
          this._emit('blacklisted', { model: currentModel.modelId, reason: error.code || error.message });
          this._emitQueueEvent('blacklisted', { model: currentModel.modelId, reason: error.code || error.message });
        }

        if (attempt === maxFallbackAttempts || !this.options.enableFallback) {
          break;
        }

        await this._backoffDelay(attempt);

        if (failedProvider && error.code === 'RATE_LIMIT') {
          const nextSelection = this.selectModel({
            taskType,
            criticality,
            contextSize,
            estimatedTokens,
            estimatedInputTokens,
            estimatedOutputTokens,
            budget,
            constraints,
            preferredModels: [],
            excludedModels: [...excludedModels, ...attemptedModels],
          });
          const nextProvider = getModelConfig(nextSelection.modelId)?.provider;
          if (nextProvider === failedProvider) {
            excludedModels.push(nextSelection.modelId);
          }
        }
      }
    }

    this.metrics.failedRequests++;
    this._emitQueueEvent('all_models_failed', { attemptedModels, lastError: lastError?.message });
    this._saveState();
    throw new Error(`All models failed after ${attemptedModels.length} attempt(s). Last error: ${lastError?.message}`);
  }

  async _callWithRetry(client, messages, options, timeout, retryConfig) {
    let lastError = null;

    for (let retry = 0; retry <= retryConfig.maxRetries; retry++) {
      try {
        const result = await this._callWithTimeout(client, messages, options, timeout);
        if (retry > 0) this.metrics.retryCount++;
        return result;
      } catch (error) {
        lastError = error;
        if (this._isNonRetryable(error)) {
          const err = new Error(error.message);
          err.code = error.code || 'NON_RETRYABLE';
          throw err;
        }
        if (retry < retryConfig.maxRetries) {
          const delay = Math.min(retryConfig.baseDelay * Math.pow(2, retry), retryConfig.maxDelay);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }
    throw lastError;
  }

  _isNonRetryable(error) {
    const code = error.code || '';
    const msg = (error.message || '').toLowerCase();
    if (code === 'AUTH_ERROR' || code === 'BAD_REQUEST' || code === 'INVALID_API_KEY') return true;
    if (msg.includes('invalid api key') || msg.includes('authentication') || msg.includes('unauthorized')) return true;
    return false;
  }

  async _callWithTimeout(client, messages, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const result = await client.call(messages, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Model call timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  async _backoffDelay(attempt) {
    const baseDelay = 500;
    const maxDelay = 5000;
    const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
    await new Promise(r => setTimeout(r, delay));
  }

  _recordSuccess(modelId, result, estimatedCost) {
    this.metrics.successfulRequests++;
    const tokens = result.tokens || this._estimateTokens(result);
    this.quotas.consume(modelId, tokens, estimatedCost || 0);
    this._emit('success', { model: modelId, result });
  }

  _estimateTokens(result) {
    if (result.content && typeof result.content === 'string') {
      return Math.ceil(result.content.length / 4);
    }
    return 1000;
  }

  _recordFailure(modelId, error, context) {
    this.failureHistory.record(modelId, {
      error: error.message,
      code: error.code,
      latency: context.latency,
      attempt: context.attempt,
      contextSize: context.contextSize,
    });
    this._emit('failure', { model: modelId, error, context });
  }

  _shouldBlacklist(modelId, error) {
    if (!modelId) return false;
    const recentFailures = this.failureHistory.getFailureCount(modelId, 5 * 60 * 1000);
    const isRateLimit = error.code === 'RATE_LIMIT' || error.message?.toLowerCase().includes('rate limit');
    const isAuthError = error.code === 'AUTH_ERROR' || this._isAuthMessage(error);
    return recentFailures >= 3 || isRateLimit || isAuthError;
  }

  _shouldEscalate(error) {
    return error.code === 'AUTH_ERROR' || this._isAuthMessage(error);
  }

  _isAuthMessage(error) {
    const msg = (error.message || '').toLowerCase();
    return msg.includes('invalid api key')
      || msg.includes('unauthorized')
      || msg.includes('authentication failed')
      || msg.includes('authentication required')
      || msg.includes('auth_error');
  }

  _calculateBlacklistDuration(error) {
    const isRateLimit = error.code === 'RATE_LIMIT' || error.message?.toLowerCase().includes('rate limit');
    const isAuthError = error.code === 'AUTH_ERROR' || this._isAuthMessage(error);
    if (isAuthError) return 30 * 60 * 1000;
    if (isRateLimit) return 10 * 60 * 1000;
    return 5 * 60 * 1000;
  }

  on(event, listener) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
    this.eventListeners.get(event).add(listener);
    return () => this.off(event, listener);
  }

  off(event, listener) {
    const listeners = this.eventListeners.get(event);
    if (listeners) listeners.delete(listener);
  }

  _emit(event, data) {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try { listener(data); } catch (e) { console.error(`Error in ${event} listener:`, e); }
      }
    }
  }

  _emitQueueEvent(event, data) {
    if (this.options.queueEmitter) {
      this.options.queueEmitter(event, data);
    }
    if (this.persistence) {
      this.persistence.append(event, data);
    }
    this._emit(`queue:${event}`, data);
  }

  getMetrics() {
    return { ...this.metrics };
  }

  getStatus() {
    return {
      models: {
        total: getAllModels().length,
        registered: this.modelClients.size,
        available: this.getAvailableModels().length,
        blacklisted: this.blacklist.getBlacklistedModels().length,
        healthStates: this.blacklist.getHealthStates(),
      },
      quotas: this.quotas.getAll(),
      globalBudget: this.quotas.getGlobalBudgetStatus(),
      failures: this.failureHistory.getAll(),
      metrics: this.getMetrics(),
    };
  }

  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      fallbackCount: 0,
      blacklistEvents: 0,
      quotaRejections: 0,
      budgetRejections: 0,
      retryCount: 0,
    };
  }

  clearBlacklist() {
    this.blacklist.clear();
  }

  clearFailureHistory(modelId) {
    this.failureHistory.clear(modelId);
  }

  setQuota(modelId, quota) {
    this.quotas.setQuota(modelId, quota);
  }

  setGlobalBudget(budget) {
    this.quotas.setGlobalBudget(budget);
  }

  shutdown() {
    if (this.persistence) this.persistence.shutdown();
    if (this.costLedger) this.costLedger.shutdown();
    this._saveState();
  }
}

export { ModelRouter };
export default ModelRouter;