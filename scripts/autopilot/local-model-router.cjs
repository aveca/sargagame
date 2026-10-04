'use strict';
/**
 * local-model-router.cjs — routage 100% local des modèles selon tâche + hardware.
 * 
 * Règles :
 * - Aucun appel cloud
 * - Sélection basée sur modèles installés + VRAM/RAM disponible
 * - Priorité : qualité max AVEC stabilité 24/7
 * - Fallback local uniquement
 */

const { detectHardware } = require('./hardware.cjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CACHE_FILE = path.join(ROOT, '.ai', 'autopilot', 'model-cache.json');

const TASK_TYPES = {
  CODING: 'coding',
  VISION: 'vision',
  FAST: 'fast',
  STRONG: 'strong',
  REVIEW: 'review'
};

// Modèles coding connus (par ordre de préférence générale)
const CODING_MODELS = [
  'qwen3-coder:30b',
  'qwen2.5-coder:32b', 
  'qwen2.5-coder:14b',
  'qwen2.5-coder:7b',
  'deepseek-coder:33b',
  'deepseek-coder:14b',
  'deepseek-coder:6.7b',
  'codellama:34b',
  'codellama:13b',
  'codellama:7b',
  'starcoder2:15b',
  'starcoder2:7b',
  'starcoder2:3b'
];

// Modèles vision connus (avec qwen3.6 si vision confirmé)
const VISION_MODELS = [
  'qwen3.6:latest',  // if vision confirmed via Ollama metadata
  'qwen2.5vl:32b',
  'qwen2.5vl:7b',
  'qwen2.5vl:3b',
  'llava:34b',
  'llava:13b', 
  'llava:7b',
  'bakllava:7b',
  'llava-llama3:8b',
  'moondream:1.8b'
];

// Modèles rapides (pour fast tasks)
const FAST_MODELS = [
  'qwen2.5-coder:7b',
  'qwen2.5:7b',
  'qwen2.5:3b',
  'phi3:3.8b',
  'phi3:14b',
  'gemma2:2b',
  'gemma2:9b',
  'llama3.2:3b'
];

// Modèles strong (raisonnement complexe)
const STRONG_MODELS = [
  'qwen3-coder:30b',
  'qwen2.5:32b',
  'qwen2.5:14b',
  'deepseek-r1:32b',
  'deepseek-r1:14b',
  'deepseek-r1:7b',
  'nemotron3-ultra:47b',
  'qwq:32b'
];

function loadCache() {
  try { return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch (_) { return {}; }
}
function saveCache(data) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2));
}

async function getAvailableModels() {
  const hw = await detectHardware();
  return hw.ollama.models.map(m => m.name);
}

function estimateVRAMNeeded(modelName) {
  // Rough VRAM estimates in GB for 4-bit quantization
  const sizeMatch = modelName.match(/(\d+(?:\.\d+)?)b/i);
  if (!sizeMatch) return 8; // default assumption
  
  const params = parseFloat(sizeMatch[1]);
  // 4-bit: ~0.5 GB per billion params + overhead
  return Math.ceil(params * 0.6);
}

function hasVisionCapability(modelName) {
  const visionKeywords = ['vl', 'llava', 'bakllava', 'moondream', 'vision', 'qwen3.6', 'qwen2.5'];
  return visionKeywords.some(k => modelName.toLowerCase().includes(k));
}

function getModelSpeedClass(modelName) {
  // Estimate speed class based on model size
  const sizeMatch = modelName.match(/(\d+(?:\.\d+)?)b/i);
  if (!sizeMatch) return 'medium';
  const params = parseFloat(sizeMatch[1]);
  if (params <= 7) return 'fast';
  if (params <= 14) return 'medium';
  return 'slow';
}

function canRunModel(modelName, hw, taskType = 'coding') {
  const vramNeeded = estimateVRAMNeeded(modelName);
  const totalVRAM = hw.summary.totalVRAM_GB;
  const freeRAM = hw.summary.freeRAM_GB;
  const speedClass = getModelSpeedClass(modelName);
  
  // Can run if VRAM sufficient OR system RAM sufficient (offload)
  const canRunVRAM = totalVRAM >= vramNeeded;
  const canRunRAM = freeRAM >= vramNeeded + 4; // +4GB for OS
  
  if (!canRunVRAM && !canRunRAM) return false;
  
  // Stability check: for 24/7 operation
  // FAST/VISION: prefer VRAM fit for responsiveness
  // CODING/STRONG/REVIEW: allow offloading if enough RAM (quality > speed)
  if (taskType === 'fast' || taskType === 'vision') {
    // For fast/vision, require VRAM fit for stability/responsiveness
    if (!canRunVRAM && vramNeeded > totalVRAM * 1.5) {
      return false; // Would require too much offloading, unstable for interactive use
    }
  }
  // For CODING/STRONG/REVIEW, allow offloading if sufficient RAM
  // (quality over speed, batch processing)
  
  return true;
}

function selectBestModel(availableModels, preferredList, hw, exclude = [], taskType = 'coding') {
  for (const pref of preferredList) {
    // Exact match
    if (availableModels.includes(pref) && !exclude.includes(pref)) {
      if (canRunModel(pref, hw, taskType)) return pref;
    }
    // Stem match (e.g., qwen3-coder matches qwen3-coder:30b)
    const stem = pref.split(':')[0];
    const hit = availableModels.find(m => m.split(':')[0] === stem && !exclude.includes(m));
    if (hit && canRunModel(hit, hw, taskType)) return hit;
  }
  
  // Any coder model
  const coder = availableModels.find(m => /coder/i.test(m) && !exclude.includes(m) && canRunModel(m, hw, taskType));
  if (coder) return coder;
  
  // Any vision model  
  const vision = availableModels.find(m => VISION_MODELS.some(v => m.startsWith(v.split(':')[0])) && !exclude.includes(m) && canRunModel(m, hw, taskType));
  if (vision) return vision;
  
  // First runnable model
  const first = availableModels.find(m => !exclude.includes(m) && canRunModel(m, hw, taskType));
  if (first) return first;
  
  return null;
}

async function routeModel(taskType, options = {}) {
  const hw = await detectHardware();
  const available = await getAvailableModels();
  
  if (!available.length) {
    return { ok: false, reason: 'NO_LOCAL_MODELS', hardware: hw.summary };
  }
  
  const exclude = options.exclude || [];
  let selected = null;
  let tier = 'unknown';
  
  switch (taskType) {
    case TASK_TYPES.CODING:
      selected = selectBestModel(available, CODING_MODELS, hw, exclude, 'coding');
      tier = 'coding';
      break;
      
    case TASK_TYPES.VISION:
      selected = selectBestModel(available, VISION_MODELS, hw, exclude, 'vision');
      tier = 'vision';
      if (!selected) {
        // Fallback: any model with vision capability
        selected = available.find(m => 
          hasVisionCapability(m) 
          && !exclude.includes(m) && canRunModel(m, hw, 'vision')
        );
        if (selected) tier = 'vision-fallback';
      }
      break;
      
    case TASK_TYPES.FAST:
      selected = selectBestModel(available, FAST_MODELS, hw, exclude, 'fast');
      tier = 'fast';
      if (!selected) {
        // Fallback to smallest coding model
        const small = available.filter(m => !exclude.includes(m) && canRunModel(m, hw, 'fast'))
          .sort((a, b) => estimateVRAMNeeded(a) - estimateVRAMNeeded(b))[0];
        if (small) { selected = small; tier = 'fast-fallback'; }
      }
      break;
      
    case TASK_TYPES.STRONG:
      selected = selectBestModel(available, STRONG_MODELS, hw, exclude, 'strong');
      tier = 'strong';
      if (!selected) {
        // Fallback to best available coding model
        selected = selectBestModel(available, CODING_MODELS, hw, exclude, 'strong');
        if (selected) tier = 'strong-fallback';
      }
      break;
      
    case TASK_TYPES.REVIEW:
      // Use a different model than the one that generated
      const excludeWithPrimary = [...exclude, options.primaryModel].filter(Boolean);
      selected = selectBestModel(available, CODING_MODELS.concat(STRONG_MODELS), hw, excludeWithPrimary, 'review');
      tier = 'review';
      break;
      
    default:
      selected = selectBestModel(available, CODING_MODELS, hw, exclude, 'coding');
      tier = 'default';
  }
  
  if (!selected) {
    // Last resort: any runnable model
    selected = available.find(m => !exclude.includes(m) && canRunModel(m, hw, taskType));
    if (selected) tier = 'any-available';
  }
  
  if (!selected) {
    return { 
      ok: false, 
      reason: 'NO_RUNABLE_MODEL', 
      hardware: hw.summary,
      availableModels: available,
      vramNeeded: available.map(m => ({ model: m, vramGB: estimateVRAMNeeded(m), canRun: canRunModel(m, hw, taskType) }))
    };
  }
  
  return {
    ok: true,
    model: selected,
    tier,
    hardware: hw.summary,
    estimatedVRAM_GB: estimateVRAMNeeded(selected),
    availableModels: available.length,
    speedClass: getModelSpeedClass(selected),
    visionCapable: hasVisionCapability(selected)
  };
}

// Cache the last selection for learning
function recordSelection(taskType, model, result) {
  const cache = loadCache();
  cache.history = cache.history || [];
  cache.history.push({
    timestamp: new Date().toISOString(),
    taskType,
    model,
    success: result.ok,
    duration: result.duration,
    error: result.error
  });
  // Keep last 100
  if (cache.history.length > 100) cache.history = cache.history.slice(-100);
  saveCache(cache);
}

function getBestModelForType(taskType) {
  const cache = loadCache();
  const relevant = (cache.history || []).filter(h => h.taskType === taskType && h.success);
  if (!relevant.length) return null;
  
  // Find most successful model for this task type
  const stats = {};
  for (const h of relevant) {
    stats[h.model] = (stats[h.model] || 0) + 1;
  }
  return Object.entries(stats).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

module.exports = {
  routeModel,
  recordSelection,
  getBestModelForType,
  TASK_TYPES,
  CODING_MODELS,
  VISION_MODELS,
  FAST_MODELS,
  STRONG_MODELS
};

if (require.main === module) {
  const taskType = process.argv[2] || 'coding';
  routeModel(taskType).then(r => console.log(JSON.stringify(r, null, 2)));
}