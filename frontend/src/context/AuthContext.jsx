import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Restore session dari sessionStorage saat mount
  useEffect(() => {
    const restoreSession = async () => {
      const savedToken = sessionStorage.getItem('fb_token');
      const savedUser = sessionStorage.getItem('fb_user');

      if (savedToken && savedUser) {
        try {
          const parsedUser = JSON.parse(savedUser);
          // Hapus session lama yang pakai 'port' (SFTP) bukan 'share' (SMB2)
          if (parsedUser.port !== undefined && parsedUser.share === undefined) {
            clearSession();
            setIsLoading(false);
            return;
          }

          // Verifikasi token masih valid
          const response = await authAPI.verify(savedToken);
          if (response.data.valid) {
            setToken(savedToken);
            setUser(parsedUser);
            setIsAuthenticated(true);
          } else {
            clearSession();
          }
        } catch {
          clearSession();
        }
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const clearSession = () => {
    sessionStorage.removeItem('fb_token');
    sessionStorage.removeItem('fb_user');
    setToken(null);
    setUser(null);
    setIsAuthenticated(false);
  };

  const login = useCallback(async (host, share, username, password) => {
    const response = await authAPI.login({ host, share, username, password });
    const { token: newToken, user: newUser } = response.data;

    // Simpan ke state dan sessionStorage
    setToken(newToken);
    setUser(newUser);
    setIsAuthenticated(true);

    sessionStorage.setItem('fb_token', newToken);
    sessionStorage.setItem('fb_user', JSON.stringify(newUser));

    return response.data;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout(token);
    } catch (_) {}
    clearSession();
  }, [token]);

  const value = {
    user,
    token,
    isLoading,
    isAuthenticated,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return context;
};
