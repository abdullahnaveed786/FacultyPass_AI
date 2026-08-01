import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { useNotification } from './NotificationContext';

const AuthContext = createContext(null);

// Get base url dynamically or fall back to localhost port 8000
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api/v1';

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('fp_admin_token') || null);
  const { addNotification } = useNotification();

  const login = async (username, password) => {
    try {
      const response = await axios.post(`${API_URL}/auth/login`, {
        username,
        password
      });
      const jwtToken = response.data.access_token;
      localStorage.setItem('fp_admin_token', jwtToken);
      setToken(jwtToken);
      addNotification('Admin login successful.', 'success');
      return true;
    } catch (error) {
      const msg = error.response?.data?.detail || 'Invalid username or password.';
      addNotification(msg, 'error');
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('fp_admin_token');
    setToken(null);
    addNotification('Logged out from admin panel.', 'info');
  };

  const isAuthenticated = !!token;

  // Intercept axios calls to append auth header
  useEffect(() => {
    const requestInterceptor = axios.interceptors.request.use(
      (config) => {
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    const responseInterceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response && error.response.status === 401) {
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.request.eject(requestInterceptor);
      axios.interceptors.response.eject(responseInterceptor);
    };
  }, [token]);

  return (
    <AuthContext.Provider value={{ token, isAuthenticated, login, logout, API_URL }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
