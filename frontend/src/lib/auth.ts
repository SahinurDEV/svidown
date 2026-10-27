/** Optional client auth for when the server has AUTH_* enabled. */

const USER_KEY = 'svidown_auth_user';
const PASS_KEY = 'svidown_auth_pass';
const TOKEN_KEY = 'svidown_auth_token';

export function getStoredAuth(): { username?: string; password?: string; token?: string } {
  if (typeof window === 'undefined') return {};
  return {
    username: localStorage.getItem(USER_KEY) || undefined,
    password: localStorage.getItem(PASS_KEY) || undefined,
    token: localStorage.getItem(TOKEN_KEY) || undefined,
  };
}

export function setStoredAuth(opts: { username?: string; password?: string; token?: string }) {
  if (typeof window === 'undefined') return;
  if (opts.token) localStorage.setItem(TOKEN_KEY, opts.token);
  if (opts.username) localStorage.setItem(USER_KEY, opts.username);
  if (opts.password) localStorage.setItem(PASS_KEY, opts.password);
}

export function clearStoredAuth() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(PASS_KEY);
  localStorage.removeItem(TOKEN_KEY);
}

export function getAuthHeaders(): Record<string, string> {
  const { username, password, token } = getStoredAuth();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
    headers['X-API-Token'] = token;
  } else if (username && password) {
    const encoded = btoa(`${username}:${password}`);
    headers['Authorization'] = `Basic ${encoded}`;
  }
  return headers;
}

export function getSocketAuth(): Record<string, string> | undefined {
  const { username, password, token } = getStoredAuth();
  if (token) return { token };
  if (username && password) {
    return { Authorization: `Basic ${btoa(`${username}:${password}`)}` };
  }
  return undefined;
}
