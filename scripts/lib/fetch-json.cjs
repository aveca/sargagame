'use strict';

/** Fetch JSON with a bounded wait and a machine-readable failure classification. */
async function fetchJsonWithTimeout(url, timeoutMs, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, kind: 'FETCH_FAILED', reason: 'fetch-unavailable' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response || !response.ok) {
      return {
        ok: false,
        kind: 'FETCH_FAILED',
        reason: 'http-error',
        status: response ? response.status : null,
      };
    }
    try {
      return { ok: true, data: await response.json() };
    } catch (_) {
      return { ok: false, kind: 'VALIDATION_FAILED', reason: 'invalid-json' };
    }
  } catch (error) {
    return {
      ok: false,
      kind: 'FETCH_FAILED',
      reason: error && error.name === 'AbortError' ? 'timeout' : 'network-error',
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchJsonWithTimeout };
