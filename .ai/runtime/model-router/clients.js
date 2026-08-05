const _apiKey = Symbol('apiKey');

export class ModelClient {
  constructor(config = {}) {
    this.modelId = config.modelId;
    this[_apiKey] = config.apiKey;
    this.baseUrl = this._validateBaseUrl(config.baseUrl);
    this.defaultOptions = config.defaultOptions || {};
  }

  get apiKey() {
    return '***REDACTED***';
  }

  _validateBaseUrl(url) {
    if (!url) return url;
    if (!url.startsWith('https://')) {
      throw new Error(`baseUrl must use HTTPS: ${url}`);
    }
    return url;
  }

  async call(messages, options = {}) {
    throw new Error('call() must be implemented by subclass');
  }

  _mergeOptions(options) {
    return { ...this.defaultOptions, ...options };
  }

  _formatMessages(messages) {
    return messages;
  }

  _getAuthHeader() {
    return `Bearer ${this[_apiKey]}`;
  }

  _handleError(error) {
    const err = new Error(this._redactApiKey(error.message || 'Model call failed'));
    err.code = error.code || 'UNKNOWN_ERROR';
    if (error.status) err.code = this._mapHttpStatus(error.status);
    return err;
  }

  _redactApiKey(message) {
    if (!message || !this[_apiKey]) return message;
    return message.replace(this[_apiKey], '***REDACTED***');
  }

  _mapHttpStatus(status) {
    switch (status) {
      case 401: return 'AUTH_ERROR';
      case 429: return 'RATE_LIMIT';
      case 408: return 'TIMEOUT';
      case 500: return 'SERVER_ERROR';
      case 502: return 'BAD_GATEWAY';
      case 503: return 'SERVICE_UNAVAILABLE';
      case 504: return 'GATEWAY_TIMEOUT';
      default: return `HTTP_${status}`;
    }
  }

  _fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    return fetch(url, { ...options, signal: controller.signal })
      .finally(() => clearTimeout(timeoutId));
  }
}

export function createModelClient(modelId, config) {
  const clients = {
    nemotron: () => new NemotronClient({ ...config, modelId }),
    'nemotron-mini': () => new NemotronClient({ ...config, modelId, isMini: true }),
    glm: () => new GLMClient({ ...config, modelId }),
    'glm-deep': () => new GLMClient({ ...config, modelId, isDeep: true }),
    'ling-suite': () => new LingSuiteClient({ ...config, modelId }),
    'qwen-7b': () => new QwenClient({ ...config, modelId, size: '7b' }),
    'qwen-14b': () => new QwenClient({ ...config, modelId, size: '14b' }),
    'qwen-32b': () => new QwenClient({ ...config, modelId, size: '32b' }),
  };

  const factory = clients[modelId];
  if (!factory) throw new Error(`Unknown model: ${modelId}`);
  return factory();
}

class NemotronClient extends ModelClient {
  constructor(config) {
    super(config);
    this.baseUrl = this._validateBaseUrl(config.baseUrl || 'https://integrate.api.nvidia.com/v1');
  }

  async call(messages, options = {}) {
    const opts = this._mergeOptions(options);
    const timeout = opts.timeout || 30000;
    const response = await this._fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': this._getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: this._formatMessages(messages),
        max_tokens: opts.maxTokens || 4096,
        temperature: opts.temperature ?? 0.7,
        top_p: opts.topP ?? 0.95,
        stream: opts.stream || false,
      }),
    }, timeout);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw this._handleError({ ...error, status: response.status });
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      tokens: data.usage?.total_tokens || 0,
      usage: data.usage,
      raw: data,
    };
  }
}

class GLMClient extends ModelClient {
  constructor(config) {
    super(config);
    this.baseUrl = this._validateBaseUrl(config.baseUrl || 'https://open.bigmodel.cn/api/paas/v4');
    this.isDeep = config.isDeep || false;
  }

  async call(messages, options = {}) {
    const opts = this._mergeOptions(options);
    const timeout = opts.timeout || (this.isDeep ? 120000 : 30000);
    const response = await this._fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': this._getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: this._formatMessages(messages),
        max_tokens: opts.maxTokens || (this.isDeep ? 8192 : 4096),
        temperature: opts.temperature ?? 0.7,
        top_p: opts.topP ?? 0.95,
        stream: opts.stream || false,
        tools: opts.tools,
      }),
    }, timeout);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw this._handleError({ ...error, status: response.status });
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      tokens: data.usage?.total_tokens || 0,
      usage: data.usage,
      raw: data,
    };
  }
}

class LingSuiteClient extends ModelClient {
  constructor(config) {
    super(config);
    this.baseUrl = this._validateBaseUrl(config.baseUrl || 'https://api.ling.ai/v1');
  }

  async call(messages, options = {}) {
    const opts = this._mergeOptions(options);
    const timeout = opts.timeout || 25000;
    const response = await this._fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': this._getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        messages: this._formatMessages(messages),
        max_tokens: opts.maxTokens || 4096,
        temperature: opts.temperature ?? 0.7,
        top_p: opts.topP ?? 0.9,
        stream: opts.stream || false,
        response_format: opts.responseFormat,
      }),
    }, timeout);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw this._handleError({ ...error, status: response.status });
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      tokens: data.usage?.total_tokens || 0,
      usage: data.usage,
      raw: data,
    };
  }
}

class QwenClient extends ModelClient {
  constructor(config) {
    super(config);
    this.size = config.size;
    this.baseUrl = this._validateBaseUrl(config.baseUrl || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation');
  }

  async call(messages, options = {}) {
    const opts = this._mergeOptions(options);
    const timeout = opts.timeout || 30000;
    const response = await this._fetchWithTimeout(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': this._getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.modelId,
        input: { messages: this._formatMessages(messages) },
        parameters: {
          max_tokens: opts.maxTokens || 4096,
          temperature: opts.temperature ?? 0.7,
          top_p: opts.topP ?? 0.8,
          result_format: 'message',
        },
      }),
    }, timeout);

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw this._handleError({ ...error, status: response.status });
    }

    const data = await response.json();
    return {
      content: data.output?.choices?.[0]?.message?.content || '',
      tokens: data.usage?.total_tokens || 0,
      usage: data.usage,
      raw: data,
    };
  }
}

export { NemotronClient, GLMClient, LingSuiteClient, QwenClient };