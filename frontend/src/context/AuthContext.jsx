import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const clearError = () => setError('');

  // Fetch Profile & Tokens
  const fetchProfile = async () => {
    try {
      const res = await api.get('/users/profile');
      setUser(res.data.user);
      setTokens(res.data.tokens);
      fetchNotifications();
    } catch (err) {
      console.error('Failed to load profile:', err);
      logout();
    } finally {
      setLoading(false);
    }
  };

  // Fetch Notifications
  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  // Check login state on load
  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      fetchProfile();
    } else {
      setLoading(false);
    }
  }, []);

  // Presence heartbeat (§4.2): ping every 20s while logged in so the admin hub
  // can show a live online/offline indicator. Silently skips once tokens are
  // cleared (e.g. after the one-time interview forced logout).
  useEffect(() => {
    if (!user) return;

    const ping = () => {
      if (!localStorage.getItem('access_token')) return;
      api.post('/users/heartbeat').catch(() => {});
    };

    ping();
    const beat = setInterval(ping, 20000);

    // Fire an explicit "gone offline" signal when the tab/browser actually closes
    // (or is refreshed), instead of waiting out the heartbeat timeout window.
    // `keepalive` lets the request survive page teardown; `pagehide` fires more
    // reliably across browsers than `beforeunload` (including on mobile/bfcache).
    const markOffline = () => {
      const token = localStorage.getItem('access_token');
      if (!token) return;
      fetch(`${api.defaults.baseURL}/users/presence/offline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        keepalive: true,
      }).catch(() => {});
    };
    window.addEventListener('pagehide', markOffline);

    return () => {
      clearInterval(beat);
      window.removeEventListener('pagehide', markOffline);
    };
  }, [user?.id]);

  // Login — identifier may be an email address or a CNIC number (§3.1)
  const login = async (identifier, password) => {
    let finalIdentifier = identifier;
    let finalPassword = password;
    if (identifier && typeof identifier === 'object') {
      finalIdentifier = identifier.email || identifier.identifier;
      finalPassword = identifier.password;
    }

    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { email: finalIdentifier, password: finalPassword });
      const { user: userData, tokens: tokenData, access_token, refresh_token } = res.data;

      localStorage.setItem('access_token', access_token);
      if (refresh_token) {
        localStorage.setItem('refresh_token', refresh_token);
      } else {
        // One-time interview sessions get no refresh token by design (§3.3)
        localStorage.removeItem('refresh_token');
      }

      setUser(userData);
      setTokens(tokenData);
      fetchNotifications();
      setLoading(false);
      return res.data;
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Unable to log in. Please check your credentials and try again.');
      throw err;
    }
  };

  // Register — completed-course candidates and re-interview requests do NOT get
  // auto-logged-in; the caller inspects res.status to show the right screen.
  const register = async (payload) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/register', payload);
      const { user: userData, tokens: tokenData, access_token, refresh_token } = res.data;

      if (access_token) {
        localStorage.setItem('access_token', access_token);
        if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
        setUser(userData);
        setTokens(tokenData);
        fetchNotifications();
      }
      setLoading(false);
      return res.data;
    } catch (err) {
      setLoading(false);
      setError(err.response?.data?.message || 'Unable to register right now. Please try again.');
      throw err;
    }
  };

  // Logout
  const logout = async () => {
    try {
      await api.post('/users/presence/offline');
      await api.post('/auth/logout');
    } catch (err) {
      console.warn('Logout API failed:', err);
    } finally {
      localStorage.clear();
      setUser(null);
      setTokens(null);
      setNotifications([]);
    }
  };

  // Mark notifications as read
  const readAllNotifications = async () => {
    try {
      await api.post('/notifications/read');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to read notifications:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tokens,
        notifications,
        loading,
        error,
        clearError,
        login,
        register,
        logout,
        fetchProfile,
        fetchNotifications,
        readAllNotifications,
        setTokens
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
