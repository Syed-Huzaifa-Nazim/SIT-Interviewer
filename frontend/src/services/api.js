import axios from 'axios';

// Create Axios Instance
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Cold-start detection ------------------------------------------------------
// Free-tier hosts (Render included) spin the backend down after a period of
// inactivity; the next request can take 30-50s to wake it back up. A request that
// slow looks identical to a hung/broken app unless we tell the user what's actually
// happening. Any request still pending past SLOW_THRESHOLD_MS is assumed to be a
// cold start; ColdStartNotice.jsx subscribes to this to show a "waking up" banner.
const SLOW_THRESHOLD_MS = 4000;
let slowCount = 0;
const slowListeners = new Set();

function notifySlowChange() {
  const active = slowCount > 0;
  slowListeners.forEach((cb) => cb(active));
}

export function onSlowRequestChange(callback) {
  slowListeners.add(callback);
  callback(slowCount > 0);
  return () => slowListeners.delete(callback);
}

function clearSlowTimer(config) {
  const meta = config?.__slowMeta;
  if (!meta) return;
  clearTimeout(meta.timerId);
  if (meta.fired) {
    slowCount = Math.max(0, slowCount - 1);
    notifySlowChange();
  }
}

// Request Interceptor: Attach Access Token + arm the cold-start timer
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    const meta = { fired: false, timerId: null };
    meta.timerId = setTimeout(() => {
      meta.fired = true;
      slowCount += 1;
      notifySlowChange();
    }, SLOW_THRESHOLD_MS);
    config.__slowMeta = meta;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Silent Token Refresh
api.interceptors.response.use(
  (response) => {
    clearSlowTimer(response.config);
    return response;
  },
  async (error) => {
    clearSlowTimer(error.config);
    // Normalize FastAPI's default { detail } error shape to { message } so
    // every err.response?.data?.message read across the app gets the real
    // backend message instead of silently falling back to generic text.
    if (error.response?.data && error.response.data.message === undefined && error.response.data.detail !== undefined) {
      error.response.data.message = typeof error.response.data.detail === 'string'
        ? error.response.data.detail
        : JSON.stringify(error.response.data.detail);
    }

    const originalRequest = error.config;
    const isAuthEndpoint = /\/auth\/(login|register|refresh)$/.test(originalRequest?.url || '');

    // Check if error is 401 and not already retried.
    // The backend returns FastAPI's default { detail } shape (never a
    // { error: 'token_expired' } field), so any 401 on a non-auth request
    // is treated as a candidate for silent refresh.
    if (
      error.response &&
      error.response.status === 401 &&
      !isAuthEndpoint &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('refresh_token');

      if (!refreshToken) {
        // No refresh token available, logout user
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        // Request a new access token
        const res = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${refreshToken}`,
            },
          }
        );

        if (res.status === 200) {
          const newAccessToken = res.data.access_token;
          localStorage.setItem('access_token', newAccessToken);

          // Retry the original request with the new access token
          originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh token expired or invalid, logout user
        localStorage.clear();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
