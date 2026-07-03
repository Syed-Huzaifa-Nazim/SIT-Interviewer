import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [tokens, setTokens] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

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

  // Login
  const login = async (email, password) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user: userData, tokens: tokenData, access_token, refresh_token } = res.data;
      
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      
      setUser(userData);
      setTokens(tokenData);
      fetchNotifications();
      setLoading(false);
      return userData;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  // Register
  const register = async (name, email, password, country, experience_level, job_role) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        name,
        email,
        password,
        country,
        experience_level,
        job_role,
      });
      const { user: userData, tokens: tokenData, access_token, refresh_token } = res.data;
      
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('refresh_token', refresh_token);
      
      setUser(userData);
      setTokens(tokenData);
      fetchNotifications();
      setLoading(false);
      return userData;
    } catch (err) {
      setLoading(false);
      throw err;
    }
  };

  // Logout
  const logout = async () => {
    try {
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
