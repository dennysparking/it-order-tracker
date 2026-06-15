import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, setAuthExpiredHandler } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [appState, setAppState] = useState("loading"); // loading | setup | login | app
  const [user, setUser] = useState(null);

  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setUser(null);
    setAppState("login");
  }, []);

  const login = useCallback((u) => {
    setUser(u);
    setAppState("app");
  }, []);

  useEffect(() => {
    setAuthExpiredHandler(() => {
      setUser(null);
      setAppState("login");
    });

    (async () => {
      const setupRes = await api.get("/api/auth/setup-needed");
      if (setupRes?.setupNeeded) return setAppState("setup");

      const meRes = await api.get("/api/auth/me");
      if (meRes?.user) {
        setUser(meRes.user);
        setAppState("app");
      } else {
        setAppState("login");
      }
    })();
  }, []);

  return (
    <AuthContext.Provider value={{ appState, setAppState, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
