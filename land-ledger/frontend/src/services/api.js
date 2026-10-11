'use strict';

/**
 * Tiny dedicated HTTP utility on top of native fetch().
 * - resolves /api relative to current origin (dev proxy or integrated deployment)
 * - injects Authorization header from storage
 * - normalizes errors to ApiError { message, errorCode, status, details }
 */

const TOKEN_KEY = 'landledger.token';

export class ApiError extends Error {
  constructor({ message, errorCode, status, details }) {
    super(message);
    this.name = 'ApiError';
    this.errorCode = errorCode || 'REQUEST_FAILED';
    this.status = status || 0;
    this.details = details || null;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function api(path, { method = 'GET', body, formData, signal } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      signal,
      body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError({ message: 'Cannot reach the Land Ledger service. Check your connection.', errorCode: 'NETWORK_ERROR', status: 0 });
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || (payload && payload.success === false)) {
    // Global session-expiry handling: an expired/invalid JWT mid-session should
    // drop the stale token and return the user to sign-in, not leave every
    // page showing a dead retry loop.
    if (res.status === 401 && ['UNAUTHENTICATED', 'INVALID_TOKEN', 'USER_NOT_FOUND'].includes((payload && payload.errorCode) || '')) {
      setToken(null);
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    throw new ApiError({
      message: (payload && payload.message) || `Request failed with status ${res.status}`,
      errorCode: (payload && payload.errorCode) || 'REQUEST_FAILED',
      status: res.status,
      details: (payload && payload.details) || null,
    });
  }
  return payload;
}

export function get(path, signal) {
  return api(path, { signal });
}
export function post(path, body, signal) {
  return api(path, { method: 'POST', body, signal });
}
export function put(path, body, signal) {
  return api(path, { method: 'PUT', body, signal });
}
