export const MODEL_CONFIGS = {
  nemotron: {
    id: 'nemotron',
    name: 'Nemotron 3 Ultra',
    provider: 'nvidia',
    deployment: 'cloud',
    maxContext: 128000,
    maxOutput: 4096,
    priority: 1,
    costPer1kTokens: { input: 0.0001, output: 0.0004 },
    capabilities: ['reasoning', 'coding', 'analysis', 'long-context'],
    latencyProfile: 'medium',
    reliability: 0.95,
    defaultTimeout: 30000,
    retryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
  },
  'nemotron-mini': {
    id: 'nemotron-mini',
    name: 'Nemotron 3 Ultra Mini',
    provider: 'nvidia',
    deployment: 'cloud',
    maxContext: 32768,
    maxOutput: 2048,
    priority: 2,
    costPer1kTokens: { input: 0.00005, output: 0.0002 },
    capabilities: ['fast-inference', 'simple-tasks', 'low-latency', 'coding'],
    latencyProfile: 'fast',
    reliability: 0.93,
    defaultTimeout: 15000,
    retryConfig: { maxRetries: 3, baseDelay: 500, maxDelay: 5000 },
  },
  glm: {
    id: 'glm',
    name: 'GLM-4',
    provider: 'zhipu',
    deployment: 'cloud',
    maxContext: 128000,
    maxOutput: 4096,
    priority: 3,
    costPer1kTokens: { input: 0.00015, output: 0.0006 },
    capabilities: ['reasoning', 'multilingual', 'tool-use', 'long-context'],
    latencyProfile: 'medium',
    reliability: 0.92,
    defaultTimeout: 30000,
    retryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
  },
  'glm-deep': {
    id: 'glm-deep',
    name: 'GLM-4-DeepResearch',
    provider: 'zhipu',
    deployment: 'cloud',
    maxContext: 200000,
    maxOutput: 8192,
    priority: 4,
    costPer1kTokens: { input: 0.001, output: 0.004 },
    capabilities: ['deep-research', 'complex-reasoning', 'very-long-context', 'analysis'],
    latencyProfile: 'slow',
    reliability: 0.9,
    defaultTimeout: 120000,
    retryConfig: { maxRetries: 2, baseDelay: 5000, maxDelay: 30000 },
  },
  'ling-suite': {
    id: 'ling-suite',
    name: 'LingSuite',
    provider: 'ling',
    deployment: 'cloud',
    maxContext: 32768,
    maxOutput: 4096,
    priority: 6,
    costPer1kTokens: { input: 0.00012, output: 0.0005 },
    capabilities: ['multilingual', 'translation', 'summarization', 'structured-output'],
    latencyProfile: 'medium',
    reliability: 0.89,
    defaultTimeout: 25000,
    retryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 8000 },
  },
  'qwen-7b': {
    id: 'qwen-7b',
    name: 'Qwen 2.5 7B',
    provider: 'alibaba',
    deployment: 'cloud',
    maxContext: 32768,
    maxOutput: 4096,
    priority: 7,
    costPer1kTokens: { input: 0.00006, output: 0.00025 },
    capabilities: ['efficient', 'coding', 'multilingual'],
    latencyProfile: 'fast',
    reliability: 0.87,
    defaultTimeout: 15000,
    retryConfig: { maxRetries: 3, baseDelay: 500, maxDelay: 5000 },
  },
  'qwen-14b': {
    id: 'qwen-14b',
    name: 'Qwen 2.5 14B',
    provider: 'alibaba',
    deployment: 'cloud',
    maxContext: 32768,
    maxOutput: 4096,
    priority: 8,
    costPer1kTokens: { input: 0.0001, output: 0.0004 },
    capabilities: ['reasoning', 'coding', 'multilingual', 'balanced'],
    latencyProfile: 'medium',
    reliability: 0.89,
    defaultTimeout: 20000,
    retryConfig: { maxRetries: 3, baseDelay: 800, maxDelay: 6000 },
  },
  'qwen-32b': {
    id: 'qwen-32b',
    name: 'Qwen 2.5 32B',
    provider: 'alibaba',
    deployment: 'cloud',
    maxContext: 32768,
    maxOutput: 4096,
    priority: 9,
    costPer1kTokens: { input: 0.0003, output: 0.0012 },
    capabilities: ['complex-reasoning', 'coding', 'high-quality'],
    latencyProfile: 'medium',
    reliability: 0.91,
    defaultTimeout: 30000,
    retryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
  },
};

export const TASK_TYPE_MAP = {
  reasoning: ['glm-deep', 'nemotron', 'glm', 'qwen-32b'],
  coding: ['nemotron', 'qwen-32b', 'qwen-14b', 'nemotron-mini', 'glm'],
  analysis: ['glm-deep', 'nemotron', 'glm', 'qwen-32b'],
  fast: ['nemotron-mini', 'qwen-7b', 'qwen-14b', 'glm'],
  'long-context': ['glm-deep', 'nemotron', 'glm'],
  multilingual: ['glm', 'ling-suite', 'qwen-14b', 'qwen-32b'],
  research: ['glm-deep', 'glm', 'nemotron'],
  summarization: ['ling-suite', 'glm', 'nemotron-mini'],
  translation: ['ling-suite', 'glm', 'qwen-14b'],
  'cost-optimized': ['nemotron-mini', 'qwen-7b', 'qwen-14b'],
  'high-reliability': ['nemotron', 'glm', 'qwen-32b', 'qwen-14b'],
  default: ['nemotron', 'glm', 'qwen-14b', 'nemotron-mini', 'qwen-7b'],
  supervisor: ['glm-deep', 'nemotron', 'glm'],
  release: ['nemotron-mini', 'nemotron', 'qwen-7b'],
  ui: ['nemotron-mini', 'glm', 'qwen-14b'],
  growth: ['nemotron', 'glm', 'ling-suite'],
  data: ['glm-deep', 'nemotron', 'glm'],
  qa: ['nemotron', 'glm', 'qwen-14b'],
  security: ['glm-deep', 'nemotron', 'glm'],
  product: ['glm-deep', 'nemotron', 'glm'],
};

export const CRITICALITY_PROFILES = {
  P0: {
    name: 'Critical',
    reliabilityWeight: 0.5,
    costWeight: 0.05,
    speedWeight: 0.1,
    contextWeight: 0.2,
    healthWeight: 0.15,
    minReliability: 0.9,
    excludeLatencyProfiles: ['slow'],
  },
  P1: {
    name: 'High',
    reliabilityWeight: 0.35,
    costWeight: 0.2,
    speedWeight: 0.15,
    contextWeight: 0.2,
    healthWeight: 0.1,
    minReliability: 0.85,
    excludeLatencyProfiles: [],
  },
  P2: {
    name: 'Standard',
    reliabilityWeight: 0.2,
    costWeight: 0.35,
    speedWeight: 0.2,
    contextWeight: 0.15,
    healthWeight: 0.1,
    minReliability: 0.8,
    excludeLatencyProfiles: [],
  },
  P3: {
    name: 'Background',
    reliabilityWeight: 0.1,
    costWeight: 0.5,
    speedWeight: 0.25,
    contextWeight: 0.1,
    healthWeight: 0.05,
    minReliability: 0.75,
    excludeLatencyProfiles: [],
  },
};

export function getModelConfig(modelId) {
  return MODEL_CONFIGS[modelId];
}

export function getModelsForTaskType(taskType) {
  const modelIds = TASK_TYPE_MAP[taskType] || TASK_TYPE_MAP.default;
  return modelIds.map(id => MODEL_CONFIGS[id]).filter(Boolean);
}

export function getModelsForRole(role) {
  return getModelsForTaskType(role);
}

export function getAllModels() {
  return Object.values(MODEL_CONFIGS);
}

export function sortModelsByPriority(models) {
  return [...models].sort((a, b) => a.priority - b.priority);
}

export function calculateConfidenceScore(model, contextSize, taskType, criticality = 'P1') {
  const config = MODEL_CONFIGS[model];
  if (!config) return 0;

  const profile = CRITICALITY_PROFILES[criticality] || CRITICALITY_PROFILES.P1;

  if (config.reliability < profile.minReliability) return 0;
  if (profile.excludeLatencyProfiles.includes(config.latencyProfile)) return 0;

  let score = config.reliability * profile.reliabilityWeight;

  const hasCapability = config.capabilities.some(c =>
    TASK_TYPE_MAP[taskType]?.includes(config.id) || c === taskType
  );
  if (hasCapability) score += 0.15 * profile.contextWeight;

  if (config.maxContext >= contextSize) score += 0.2 * profile.contextWeight;
  else score -= 0.3 * profile.contextWeight;

  const cost = config.costPer1kTokens.input + config.costPer1kTokens.output;
  const costScore = Math.max(0, 1 - cost * 5000);
  score += costScore * profile.costWeight;

  const speedScore = { fast: 1, medium: 0.6, slow: 0.2 };
  score += (speedScore[config.latencyProfile] || 0.5) * profile.speedWeight;

  return Math.max(0, Math.min(1, score));
}

export function estimateCost(modelId, estimatedInputTokens, estimatedOutputTokens) {
  const config = MODEL_CONFIGS[modelId];
  if (!config) return 0;
  const inputCost = (estimatedInputTokens / 1000) * config.costPer1kTokens.input;
  const outputCost = (estimatedOutputTokens / 1000) * config.costPer1kTokens.output;
  return inputCost + outputCost;
}