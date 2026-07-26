export const API_BASE = '';

export async function fetchJson(url) {
  const response = await fetch(url);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(`API returned ${response.status} (not JSON). Check ${url.split('?')[0]}`);
  }
  return response.json();
}
