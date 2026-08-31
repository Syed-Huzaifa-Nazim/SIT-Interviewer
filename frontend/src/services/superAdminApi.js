import axios from 'axios';

/**
 * Client for /api/superadmin/*.
 *
 * A SEPARATE axios instance with its OWN token, deliberately, on both sides of the wire:
 *
 * - The backend mints super-admin tokens with a claim that only the dedicated sign-in
 *   produces, and refuses the management endpoints to any token without it. Sending the
 *   ordinary `access_token` here would simply be rejected.
 * - Sharing one localStorage key would make the two sessions overwrite each other. Signing
 *   into the management portal would silently end the Admin Hub session in the other tab,
 *   and signing back into the Hub would end this one.
 *
 * There is also no silent refresh, unlike the main client. The management session is short
 * on purpose (a few hours) because it can create admins and move candidates between
 * companies; quietly extending it would undo that.
 */

export const SUPERADMIN_TOKEN_KEY = 'superadmin_token';
export const SUPERADMIN_USER_KEY = 'superadmin_user';

const superAdminApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

superAdminApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(SUPERADMIN_TOKEN_KEY);
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

superAdminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    // Match the main client: FastAPI returns { detail }, the app reads { message }.
    if (
      error.response?.data &&
      error.response.data.message === undefined &&
      error.response.data.detail !== undefined
    ) {
      error.response.data.message =
        typeof error.response.data.detail === 'string'
          ? error.response.data.detail
          : JSON.stringify(error.response.data.detail);
    }

    const isLogin = /\/superadmin\/login$/.test(error.config?.url || '');
    if (error.response?.status === 401 && !isLogin) {
      // The session expired or was revoked. Clear ONLY the management keys — the person is
      // very likely also signed into the Admin Hub in another tab, and localStorage.clear()
      // would sign them out of that too, for no reason.
      clearSuperAdminSession();
      window.location.href = '/superadmin/login';
    }
    return Promise.reject(error);
  }
);

export function saveSuperAdminSession(token, user) {
  localStorage.setItem(SUPERADMIN_TOKEN_KEY, token);
  localStorage.setItem(SUPERADMIN_USER_KEY, JSON.stringify(user));
}

export function clearSuperAdminSession() {
  localStorage.removeItem(SUPERADMIN_TOKEN_KEY);
  localStorage.removeItem(SUPERADMIN_USER_KEY);
}

export function readSuperAdminSession() {
  const token = localStorage.getItem(SUPERADMIN_TOKEN_KEY);
  if (!token) return null;
  try {
    return { token, user: JSON.parse(localStorage.getItem(SUPERADMIN_USER_KEY) || 'null') };
  } catch {
    // A corrupted blob must not leave the portal permanently unopenable.
    clearSuperAdminSession();
    return null;
  }
}

export default superAdminApi;
