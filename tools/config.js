export function resolveApiBase() {
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return '';
  }
  return 'https://api.earentir.dev';
}

export const API_BASE = resolveApiBase();

export class ApiError extends Error {
  constructor({ kind, message, hint } = {}, status = 0) {
    super(message || 'Something went wrong');
    this.kind = kind || 'internal';
    this.hint = hint || '';
    this.status = status;
  }
}

async function parseError(response) {
  let body = null;
  try {
    body = await response.json();
  } catch {
    /* non-JSON */
  }
  if (body?.error) {
    return new ApiError(body.error, response.status);
  }
  if (body?.msg) {
    return new ApiError({ message: body.msg }, response.status);
  }
  return new ApiError({ message: `Request failed (HTTP ${response.status})` }, response.status);
}

export async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json') && !contentType.includes('text/event-stream')) {
    if (!response.ok) {
      throw await parseError(response);
    }
    throw new Error(`API returned ${response.status} (not JSON). Check ${String(url).split('?')[0]}`);
  }
  if (!response.ok) {
    throw await parseError(response);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function postJson(path, body, options = {}) {
  return fetchJson(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body ?? {}),
    ...options,
  });
}

export async function postForm(path, formData, options = {}) {
  return fetchJson(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: formData,
    ...options,
  });
}

export async function getJson(path, options = {}) {
  return fetchJson(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    ...options,
  });
}

/** Subscribe to a job SSE stream; resolves with result or rejects on failure. */
export function watchJob(jobId, onProgress) {
  return new Promise((resolve, reject) => {
    const es = new EventSource(`${API_BASE}/jobs/v1/${encodeURIComponent(jobId)}/events`);
    let settled = false;

    es.onmessage = (ev) => {
      let update;
      try {
        update = JSON.parse(ev.data);
      } catch {
        return;
      }
      onProgress?.(update);
      if (!update.finished) {
        return;
      }
      settled = true;
      es.close();
      if (update.state === 'failed') {
        reject(new ApiError(update.error || { message: 'The job failed' }, 500));
      } else {
        resolve(update.result);
      }
    };

    es.onerror = () => {
      if (settled) {
        return;
      }
      settled = true;
      es.close();
      reject(new ApiError({ message: 'Lost the connection to the server' }, 0));
    };
  });
}
