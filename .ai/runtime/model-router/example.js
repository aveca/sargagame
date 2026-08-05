import { ModelRouter, createModelClient } from './index.js';

const router = new ModelRouter({
  defaultRole: 'default',
  selectionStrategy: 'balanced',
  enableFallback: true,
  enableBlacklist: true,
  enableQuotas: true,
  enableFailureTracking: true,
  maxFallbackAttempts: 3,
  globalTimeout: 60000,
});

router.registerClient('nemotron', createModelClient('nemotron', {
  apiKey: process.env.NEMOTRON_API_KEY,
}));

router.registerClient('nemotron-mini', createModelClient('nemotron-mini', {
  apiKey: process.env.NEMOTRON_API_KEY,
}));

router.registerClient('glm', createModelClient('glm', {
  apiKey: process.env.GLM_API_KEY,
}));

router.registerClient('glm-deep', createModelClient('glm-deep', {
  apiKey: process.env.GLM_API_KEY,
}));

router.registerClient('ling-suite', createModelClient('ling-suite', {
  apiKey: process.env.LING_API_KEY,
}));

router.registerClient('qwen-7b', createModelClient('qwen-7b', {
  apiKey: process.env.QWEN_API_KEY,
}));

router.registerClient('qwen-14b', createModelClient('qwen-14b', {
  apiKey: process.env.QWEN_API_KEY,
}));

router.registerClient('qwen-32b', createModelClient('qwen-32b', {
  apiKey: process.env.QWEN_API_KEY,
}));

router.setQuota('nemotron', { requests: 1000, tokens: 500000, windowMs: 3600000 });
router.setQuota('glm', { requests: 500, tokens: 200000, windowMs: 3600000 });
router.setQuota('qwen-32b', { requests: 200, tokens: 100000, windowMs: 3600000 });

router.on('fallback', ({ from, to, attempt }) => {
  console.log(`Fallback: ${from} -> ${to} (attempt ${attempt})`);
});

router.on('blacklisted', ({ model, reason }) => {
  console.warn(`Model blacklisted: ${model} (${reason})`);
});

router.on('failure', ({ model, error }) => {
  console.error(`Model ${model} failed:`, error.message);
});

async function exampleUsage() {
  try {
    const result = await router.call({
      role: 'reasoning',
      contextSize: 8000,
      priority: 'quality',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Explain quantum computing in simple terms.' },
      ],
      options: { temperature: 0.7, maxTokens: 2000 },
      onModelChange: (model, attempt) => {
        console.log(`Using model: ${model} (attempt ${attempt + 1})`);
      },
    });

    console.log('Response:', result.content);
    console.log('Model used:', result.model);
    console.log('Attempts:', result.attempts);
  } catch (error) {
    console.error('All models failed:', error.message);
  }

  console.log('Router status:', router.getStatus());
}

exampleUsage();

export { router };